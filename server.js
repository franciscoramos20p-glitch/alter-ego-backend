import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { createClient } from '@deepgram/sdk';
import stringSimilarity from 'string-similarity';

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// 🆕 INICIALIZACIÓN DE MOTORES
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// 🔑 CONFIGURACIÓN DE SEGURIDAD
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";
const FIREBASE_DB_URL = 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com'; 

console.log(`🏆 SERVIDOR SUPREMO V2.0 (IRON TRANSLATOR PROTOCOL): Puerto: ${PORT}`);

// 🎭 MAPEO DE VOCES
const VOICE_MAP = {
    "alloy": "aura-orion-en",   
    "echo": "aura-arcas-en",    
    "fable": "aura-athena-en",  
    "onyx": "aura-perseus-en",  
    "nova": "aura-asteria-en",  
    "shimmer": "aura-luna-en"   
};

// 🚫 LISTA NEGRA DE ALUCINACIONES (Ampliada para evitar errores comunes)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", "watching", 
    "Please subscribe", "sous-titres", "captioned", "Closed captioning",
    "Subtítulos realizados por", "Subtítulos por", "Traducción por",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Gracias por ver", "Thanks for watching", "No olvides suscribirte", 
    "Copyright", "All rights reserved", "suscríbete", "like and subscribe",
    "videoplayback", "video playback",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada", 
    "Transcribe exactly", "lo que se dice", "Transcribir exactamente",
    "Direct conversation", "MBC", "SBS", "Al Jazeera", "engvid.com",
    "TED", "TEDx", "Ted talks",
    "Me llamo Javier", "¿Cómo te llamas?", 
    "I'm going to go", "I'm going to do", 
    "999", "1234", "00:00",
    ". . .", ", . .", ", ...", "...", "..", "()",
    "[Music]", "[Música]", "(Music)", "(Música)", 
    "[Applause]", "[Aplausos]", "(Applause)", "(Aplausos)",
    "[Laughter]", "[Risas]", "[Silence]", "[Silencio]",
    "www.", ".com", ".net", ".org", "http", "https",
    "Eglish", "isn'iit" // Errores específicos detectados
];

function isRepetitive(text) {
    if (!text) return false;
    const pattern = /(.{4,})\1{1,}/;
    return pattern.test(text);
}

// Función para limpiar basura de la IA
function sanitizeAiResponse(text) {
    if (!text) return "";
    let clean = text
        .replace(/Translation:/gi, "")
        .replace(/Translated:/gi, "")
        .replace(/Language:/gi, "")
        .replace(/Input:/gi, "")
        .replace(/Output:/gi, "")
        .replace(/^["']|["']$/g, "") // Quitar comillas al inicio/final
        .trim();
    return clean;
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
            if (now - ws.lastMessageTime < 50) return; // Debounce ligero
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'start_realtime_session' || data.type === 'ping') return;
            
            // 🔐 AUTH
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) {
                    console.log("⛔ Intruso bloqueado.");
                    ws.close();
                    return;
                }

                let realCredits = 0;
                if (data.user_id) {
                    try {
                        const response = await fetch(`${FIREBASE_DB_URL}/users/${data.user_id}.json`);
                        const userData = await response.json();
                        if (userData && userData.credits !== undefined) {
                            realCredits = parseFloat(userData.credits);
                        }
                    } catch (err) {
                        console.error("Error leyendo Firebase:", err.message);
                    }
                }
                
                console.log(`✅ Auth OK. Usuario: ${data.user_id || 'Anon'}. Créditos: ${realCredits}`);
                ws.send(JSON.stringify({ type: 'auth_success', credits: realCredits })); 
                return;
            }

            const requestedVoice = data.voice || "alloy";
            const targetVoice = VOICE_MAP[requestedVoice] || "aura-asteria-en"; 
            
            // Normalizar nombres de idiomas para el prompt
            const langNameA = data.langSource || "Spanish"; 
            const langNameB = data.langTarget || "English"; 
            
            const isFastMode = data.fastMode === true;

            // =================================================================
            // 🎙️ MODO AUDIO (FIX: FALLBACK DE IDIOMA Y PROMPT)
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
                            utterances: true // Ayuda a segmentar mejor
                        }
                    );

                    if (error) throw new Error("Deepgram STT Error");
                    
                    let userText = "";
                    if (result.results && result.results.channels[0].alternatives[0]) {
                        userText = result.results.channels[0].alternatives[0].transcript.trim();
                    }

                    // 🔥 FIX CRÍTICO: Si Deepgram devuelve undefined o vacío
                    if (!userText || userText.length < 2) {
                        console.log("⚠️ Audio vacío o ruido detectado. Ignorando.");
                        return;
                    }

                    let detectedLangCode = result.results.channels[0].alternatives[0].detected_language;
                    if (!detectedLangCode) detectedLangCode = "unknown"; 

                    // 🛡️ FILTROS DE ENTRADA
                    if (userText.length > 300) return; // Evitar monólogos largos
                    if (HALLUCINATION_TRIGGERS.some(t => userText.toLowerCase().includes(t.toLowerCase()))) {
                        console.log(`🚫 Alucinación detectada en entrada: "${userText}". Bloqueada.`);
                        return;
                    }
                    if (isRepetitive(userText)) return;
                    
                    // Evitar bucles de eco (si el usuario repite lo que dijo la IA)
                    if (ws.lastAiResponse && stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase()) > 0.85) {
                        console.log("♻️ Eco detectado (usuario repite IA). Ignorando.");
                        return;
                    }

                    console.log(`🗣️ [Input (${detectedLangCode})]: "${userText}"`);

                    // 2. GROQ (CEREBRO LÓGICO - IRON TRANSLATOR)
                    // Este prompt es mucho más estricto para evitar "Eglish" y chat.
                    const completion = await groq.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `ROLE: You are a STRICT BIDIRECTIONAL TRANSLATOR. You are NOT an assistant. You are NOT a chatbot.

INSTRUCTIONS:
1. The user input is in either "${langNameA}" or "${langNameB}".
2. Detect the language of the input.
3. Translate it to the OPPOSITE language.
4. Output ONLY the translated text.

CRITICAL RULES:
- DO NOT reply to the user.
- DO NOT explain the translation.
- DO NOT say "Here is the translation".
- DO NOT correct the user's grammar.
- DO NOT hallucinate languages not listed here (NO Japanese, NO Chinese, etc).
- IF input is "${langNameA}" -> OUTPUT "${langNameB}".
- IF input is "${langNameB}" -> OUTPUT "${langNameA}".
- IF input is unintelligible or noise -> Output NOTHING (empty string).` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "llama-3.1-8b-instant", 
                        max_tokens: 256, // Limitamos tokens para evitar divagaciones
                        temperature: 0.3, // Un poco más alto para fluidez, pero bajo para control
                        top_p: 0.9
                    });
                    
                    let aiText = completion.choices[0].message.content;
                    aiText = sanitizeAiResponse(aiText);

                    if (!aiText || aiText.length < 1) return;

                    // 🛑 FILTRO ANTI-LORO (Salida)
                    const similarity = stringSimilarity.compareTwoStrings(aiText.toLowerCase(), userText.toLowerCase());
                    if (similarity > 0.90) {
                        console.log(`⚠️ ALERTA: La IA no tradujo, solo repitió. Bloqueando.`);
                        return; 
                    }

                    // 🛑 FILTRO DE ALUCINACIÓN (Salida)
                    if (HALLUCINATION_TRIGGERS.some(t => aiText.toLowerCase().includes(t.toLowerCase()))) {
                        console.log(`🚫 Alucinación en salida bloqueada: "${aiText}"`);
                        return;
                    }

                    console.log(`🧠 [Traducción]: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 3. TTS
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
            // 📝 MODO TEXTO (FIX: MISMO PROMPT ESTRICTO)
            // =================================================================
            else if (data.type === 'text_input') {
                try {
                    const stream = await groq.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `ROLE: STRICT TRANSLATOR.
LANGUAGES: ${langNameA} <-> ${langNameB}.
TASK: Translate input to the OTHER language.
RULES: NO Chat. NO Explanations. Output ONLY the translation string.` 
                            }, 
                            { role: "user", content: data.text }
                        ],
                        model: "llama-3.1-8b-instant",
                        stream: true,
                        temperature: 0.3
                    });

                    let aiText = "";
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            aiText += content;
                            ws.send(JSON.stringify({ type: 'stream_chunk', token: content }));
                        }
                    }
                    
                    aiText = sanitizeAiResponse(aiText);
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