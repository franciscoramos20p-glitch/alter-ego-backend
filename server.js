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

console.log(`🏆 SERVIDOR SUPREMO V113 (SLAVE TRANSLATOR): Puerto: ${PORT}`);

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
    ". . .", ", . .", ", ...", "...", "..",
    "[Music]", "[Música]", "(Music)", "(Música)", 
    "[Applause]", "[Aplausos]", "(Applause)", "(Aplausos)",
    "[Laughter]", "[Risas]", "[Silence]", "[Silencio]",
    "www.", ".com", ".net", ".org", "http", "https"
];

function isRepetitive(text) {
    if (!text) return false;
    const pattern = /(.{4,})\1{1,}/;
    return pattern.test(text);
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
            if (now - ws.lastMessageTime < 100) return; 
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
            
            const langNameA = data.langSource || "Spanish"; 
            const langNameB = data.langTarget || "English"; 
            
            // Detectar modo FLASH del cliente
            const isFastMode = data.fastMode === true;

            // =================================================================
            // 🎙️ MODO AUDIO (LÓGICA PROFESIONAL V113)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 1. DEEPGRAM NOVA-2 (Oído)
                    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                        audioBuffer,
                        {
                            model: "nova-2",
                            smart_format: true,
                            detect_language: true, 
                            punctuate: true
                        }
                    );

                    if (error) throw new Error("Deepgram STT Error");
                    
                    let userText = result.results.channels[0].alternatives[0].transcript.trim();
                    let detectedLangCode = result.results.channels[0].alternatives[0].detected_language;

                    // 🛡️ FILTROS DE ENTRADA
                    if (userText.length > 250) return;
                    if (userText.length < 2) return; 
                    if (HALLUCINATION_TRIGGERS.some(t => userText.toLowerCase().includes(t.toLowerCase()))) return;
                    if (isRepetitive(userText)) return;
                    if (ws.lastAiResponse && stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase()) > 0.85) return;

                    console.log(`🗣️ [Input (${detectedLangCode})]: "${userText}"`);

                    // 2. GROQ (CEREBRO ESCLAVO - SIN PERSONALIDAD)
                    // Prompt diseñado para eliminar explicaciones y chat.
                    const completion = await groq.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `YOU ARE A TRANSLATION API. YOU ARE NOT A CHATBOT.
                                
                                INPUT DATA:
                                - Source Text: "${userText}"
                                - Detected Language Code: "${detectedLangCode}"
                                - Target Option 1: "${langNameA}"
                                - Target Option 2: "${langNameB}"
                                
                                ALGORITHM:
                                1. Identify which of the two Target Options matches the Detected Language.
                                2. Translate the Source Text to the OTHER Target Option.
                                
                                ABSOLUTE PROHIBITIONS (VIOLATION = SYSTEM FAILURE):
                                - DO NOT speak to the user.
                                - DO NOT explain what you are doing (e.g., "I am translating...").
                                - DO NOT say "The translation is...".
                                - DO NOT repeat the input language.
                                - DO NOT answer questions. (If input is "Why?", output "Por qué?" or target equivalent).
                                
                                OUTPUT FORMAT:
                                - Return ONLY the translated text string.` 
                            }, 
                            { role: "user", content: userText } // Redundancia necesaria para Llama
                        ],
                        model: "llama-3.1-8b-instant", 
                        max_tokens: 500,
                        temperature: 0.0 // ❄️ CERO CREATIVIDAD. SOLO LÓGICA.
                    });
                    
                    let aiText = completion.choices[0].message.content;
                    
                    // 🧹 LIMPIEZA DE BASURA (Si la IA intenta explicar, lo borramos)
                    // Esto elimina errores como "Se seleccionó portugués..."
                    const forbiddenPhrases = [
                        "Translation:", "Translated:", "I have translated", 
                        "The text says", "In English", "In Spanish", 
                        "detected language", "selected language"
                    ];
                    forbiddenPhrases.forEach(phrase => {
                        const regex = new RegExp(phrase, "gi");
                        aiText = aiText.replace(regex, "");
                    });
                    aiText = aiText.trim();

                    if (!aiText || aiText.length < 1) return;

                    // 🛑 FILTRO ANTI-LORO (ANTI-ECHO)
                    // Si la salida es igual a la entrada, significa que falló la traducción.
                    const similarity = stringSimilarity.compareTwoStrings(aiText.toLowerCase(), userText.toLowerCase());
                    if (similarity > 0.80) {
                        console.log(`⚠️ ALERTA: La IA repitió el texto (Similitud ${similarity}). Bloqueando.`);
                        return; 
                    }

                    console.log(`🧠 [Traducción]: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 3. TTS (Generación de Voz)
                    let audioB64 = null;

                    if (isFastMode) {
                        // MODO FLASH: Solo texto, el frontend usa la voz del sistema.
                        console.log("⚡ Modo Flash: Enviando solo texto.");
                    } else {
                        // MODO HQ: Usamos Deepgram Aura
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
            // 📝 MODO TEXTO (IGUAL DE ESTRICTO)
            // =================================================================
            else if (data.type === 'text_input') {
                try {
                    const stream = await groq.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `TASK: TRANSLATE TEXT.
                                LANGUAGES: ${langNameA} <-> ${langNameB}.
                                RULES: 
                                - Output ONLY the translation.
                                - NO CHAT. NO EXPLANATIONS.` 
                            }, 
                            { role: "user", content: data.text }
                        ],
                        model: "llama-3.1-8b-instant",
                        stream: true
                    });

                    let aiText = "";
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            aiText += content;
                            ws.send(JSON.stringify({ type: 'stream_chunk', token: content }));
                        }
                    }
                    ws.lastAiResponse = aiText;
                    
                    // Generar audio si no es FastMode
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