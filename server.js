import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@deepgram/sdk';
import stringSimilarity from 'string-similarity';

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// 🆕 INICIALIZACIÓN DE MOTORES
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); 

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// 🔑 CONFIGURACIÓN DE SEGURIDAD
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";
const FIREBASE_DB_URL = 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com'; 

console.log(`🏆 SERVIDOR SUPREMO V5.0 (STRICT MODE): Puerto: ${PORT}`);

// 🎭 MAPEO DE VOCES
const VOICE_MAP = {
    "alloy": "aura-orion-en",   
    "echo": "aura-arcas-en",    
    "fable": "aura-athena-en",  
    "onyx": "aura-perseus-en",  
    "nova": "aura-asteria-en",  
    "shimmer": "aura-luna-en"   
};

// 🚫 LISTA NEGRA DE ALUCINACIONES TÉCNICAS
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "Please subscribe", "sous-titres", "captioned", "Closed captioning",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Gracias por ver", "Thanks for watching", "No olvides suscribirte", 
    "videoplayback", "video playback", "DimaTorzok", "ZHUKOV",
    "999", "1234", "00:00", 
    "www.", ".com", "http"
];

// Limpieza básica
function sanitizeAiResponse(text) {
    if (!text) return "";
    return text
        .replace(/\*\*/g, "") 
        .replace(/Translation:/gi, "")
        .replace(/^["']|["']$/g, "") 
        .trim();
}

// 💓 HEARTBEAT
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

// ==========================================
// 🔌 CONEXIÓN WEBSOCKET
// ==========================================
wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.lastMessageTime = 0; 
    ws.lastAiResponse = ""; 

    console.log(`⚡ Cliente Conectado: ${req.socket.remoteAddress}`);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            const now = Date.now();
            if (now - ws.lastMessageTime < 20) return; 
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'start_realtime_session' || data.type === 'ping') return;
            
            // 🔐 AUTH
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) {
                    ws.close();
                    return;
                }
                let realCredits = 0;
                if (data.user_id) {
                    try {
                        const response = await fetch(`${FIREBASE_DB_URL}/users/${data.user_id}.json`);
                        const userData = await response.json();
                        if (userData && userData.credits !== undefined) realCredits = parseFloat(userData.credits);
                    } catch (err) {}
                }
                console.log(`✅ Auth OK. Usuario: ${data.user_id || 'Anon'}. Créditos: ${realCredits}`);
                ws.send(JSON.stringify({ type: 'auth_success', credits: realCredits })); 
                return;
            }

            const requestedVoice = data.voice || "alloy";
            const targetVoice = VOICE_MAP[requestedVoice] || "aura-asteria-en"; 
            const langNameA = data.langSource || "Spanish"; 
            const langNameB = data.langTarget || "English"; 
            const isFastMode = data.fastMode === true;

            // =================================================================
            // 🎙️ MODO AUDIO
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 1. DEEPGRAM NOVA-2
                    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                        audioBuffer,
                        {
                            model: "nova-2",
                            smart_format: true,
                            detect_language: true, 
                            punctuate: true,
                            utterances: true
                        }
                    );

                    if (error) throw new Error("Deepgram STT Error");
                    
                    let userText = "";
                    if (result.results && result.results.channels[0].alternatives[0]) {
                        userText = result.results.channels[0].alternatives[0].transcript.trim();
                    }

                    if (!userText || userText.trim().length === 0) return;

                    if (HALLUCINATION_TRIGGERS.some(t => userText.toLowerCase().includes(t.toLowerCase()))) {
                        console.log(`🚫 Alucinación técnica bloqueada: "${userText}"`);
                        return;
                    }

                    console.log(`🗣️ [Escuchado]: "${userText}"`);

                    // 2. GEMINI 2.0 FLASH (PROMPT BLINDADO)
                    // 🔥 AQUÍ ESTÁ EL CAMBIO: Cero libertad creativa.
                    const prompt = `
                        TASK: TRANSLATE.
                        
                        CONTEXT:
                        - Input: "${userText}"
                        - Languages: ${langNameA} <-> ${langNameB}
                        
                        INSTRUCTIONS:
                        1. Detect input language.
                        2. Translate to the OTHER language.
                        
                        CRITICAL RULES:
                        - OUTPUT ONLY THE TRANSLATED TEXT.
                        - NO CHAT. NO EXPLANATIONS. NO "Here is".
                        - DO NOT INVENT. DO NOT ADD MEANING.
                        - IF INPUT IS UNINTELLIGIBLE, OUTPUT NOTHING.
                    `;

                    const resultAI = await model.generateContent(prompt);
                    const responseAI = await resultAI.response;
                    let aiText = sanitizeAiResponse(responseAI.text());

                    if (!aiText || aiText.length < 1) return;

                    // 🛑 FILTRO ANTI-LORO
                    const similarity = stringSimilarity.compareTwoStrings(aiText.toLowerCase(), userText.toLowerCase());
                    if (similarity > 0.98) {
                        console.log(`⚠️ Gemini repitió el texto exacto. Ignorando.`);
                        return; 
                    }

                    console.log(`🧠 [Traducción]: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 3. DEEPGRAM AURA (VOZ)
                    let audioB64 = null;

                    if (isFastMode) {
                        console.log("⚡ Modo Flash: Solo texto.");
                    } else {
                        const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoice}`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ text: aiText })
                        });

                        if (!response.ok) throw new Error("Deepgram TTS Error");
                        const arrayBuffer = await response.arrayBuffer();
                        audioB64 = Buffer.from(arrayBuffer).toString('base64');
                    }
                    
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));

                } catch (error) { console.error("❌ Error:", error.message); }
            }
            
            // =================================================================
            // 📝 MODO TEXTO
            // =================================================================
            else if (data.type === 'text_input') {
                try {
                    const prompt = `
                        TASK: TRANSLATE.
                        LANGUAGES: ${langNameA} <-> ${langNameB}.
                        INPUT: "${data.text}"
                        OUTPUT: ONLY TRANSLATION. NO CHAT.
                    `;

                    const resultAI = await model.generateContent(prompt);
                    const responseAI = await resultAI.response;
                    let aiText = sanitizeAiResponse(responseAI.text());
                    
                    ws.lastAiResponse = aiText;
                    
                    let audioB64 = null;
                    if (aiText.trim() && data.fastMode !== true) {
                        const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoice}`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ text: aiText })
                        });
                        const arrayBuffer = await response.arrayBuffer();
                        audioB64 = Buffer.from(arrayBuffer).toString('base64');
                    }

                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: data.text, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));
                } catch(e) { console.error("Error Texto:", e.message); }
            }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});