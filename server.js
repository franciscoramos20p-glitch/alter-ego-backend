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

console.log(`🏆 SERVIDOR SUPREMO V107 (PURE TRANSLATOR): Puerto: ${PORT}`);

// 🎭 MAPEO DE VOCES (Frontend -> Deepgram Aura)
// Estas son las voces más rápidas del mundo (Low Latency).
const VOICE_MAP = {
    "alloy": "aura-orion-en",   // Masculino (Rápido)
    "echo": "aura-arcas-en",    // Masculino (Profundo)
    "fable": "aura-athena-en",  // Femenino (Británico)
    "onyx": "aura-perseus-en",  // Masculino (Grave)
    "nova": "aura-asteria-en",  // Femenino (Energético - Default)
    "shimmer": "aura-luna-en"   // Femenino (Suave)
};

// 🚫 LISTA NEGRA DE ALUCINACIONES (Limpia la basura del audio)
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

// 💓 HEARTBEAT (Mantiene la conexión viva)
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
            
            // -----------------------------------------------------------
            // 🔐 AUTH
            // -----------------------------------------------------------
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

            // Configuración de la sesión
            const requestedVoice = data.voice || "alloy";
            const targetVoice = VOICE_MAP[requestedVoice] || "aura-asteria-en"; 
            
            // Idiomas definidos en el Frontend
            const langNameA = data.langSource || "Spanish"; 
            const langNameB = data.langTarget || "English"; 

            // =================================================================
            // 🎙️ MODO AUDIO (TRADUCTOR PURO)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 1. DEEPGRAM NOVA-2 (Oído Universal)
                    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                        audioBuffer,
                        {
                            model: "nova-2",
                            smart_format: true,
                            detect_language: true, // 🌍 Detecta automáticamente qué idioma hablaste
                            punctuate: true
                        }
                    );

                    if (error) throw new Error("Deepgram STT Error");
                    let userText = result.results.channels[0].alternatives[0].transcript.trim();

                    // 🛡️ FILTROS DE LIMPIEZA
                    if (userText.length > 200) { console.log("🔇 Texto muy largo (ignorado)."); return; }
                    if (userText.length < 2) return; 
                    if (HALLUCINATION_TRIGGERS.some(t => userText.toLowerCase().includes(t.toLowerCase()))) {
                        console.log(`🔇 Alucinación bloqueada: "${userText}"`); return; 
                    }
                    if (isRepetitive(userText)) {
                        console.log(`🔁 Repetición bloqueada: "${userText}"`); return;
                    }
                    // Evitar eco (si se escucha a sí mismo)
                    if (ws.lastAiResponse && stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase()) > 0.85) return;

                    console.log(`🗣️ [Entrada]: "${userText}"`);

                    // 2. GROQ (CEREBRO TRADUCTOR ESTRICTO)
                    // Aquí está la magia para que NO converse.
                    const completion = await groq.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `ROLE: YOU ARE A STRICT TRANSLATION ENGINE. NOT A CHATBOT.
                                
                                CONTEXT:
                                - Language A: ${langNameA}
                                - Language B: ${langNameB}
                                
                                INSTRUCTIONS:
                                1. Detect the language of the INPUT text.
                                2. IF Input is ${langNameA} -> TRANSLATE to ${langNameB}.
                                3. IF Input is ${langNameB} -> TRANSLATE to ${langNameA}.
                                4. IF Input is neither -> Translate to English.
                                
                                CRITICAL RULES (DO NOT BREAK):
                                - DO NOT ANSWER QUESTIONS. (e.g., If input is "What is your name?", output "¿Cómo te llamas?" NOT "I am an AI").
                                - DO NOT CONVERSE.
                                - DO NOT EXPLAIN.
                                - OUTPUT ONLY THE TRANSLATED TEXT STRING.
                                - KEEP ORIGINAL MEANING AND TONE.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "llama-3.1-8b-instant", // Ultra rápido
                        max_tokens: 300,
                        temperature: 0.3 // Temperatura baja para ser preciso y no creativo
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    
                    // Filtros de salida
                    if (!aiText || aiText === "SILENCE" || aiText.length < 1) return;
                    if (stringSimilarity.compareTwoStrings(aiText.toLowerCase(), userText.toLowerCase()) > 0.95) return; // Si no tradujo nada, ignorar.

                    console.log(`🧠 [Traducción]: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 3. DEEPGRAM AURA (Voz)
                    // Generamos el audio de la traducción
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
                    const audioB64 = Buffer.from(arrayBuffer).toString('base64');
                    
                    // 🔥 ENVIAR AL FRONTEND
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));

                } catch (error) { console.error("❌ Error Proceso Audio:", error.message); }
            }
            
            // =================================================================
            // 📝 MODO TEXTO (TRADUCTOR PURO)
            // =================================================================
            else if (data.type === 'text_input') {
                try {
                    const stream = await groq.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `ROLE: STRICT TRANSLATOR. ${langNameA} <-> ${langNameB}.
                                RULE: DO NOT ANSWER. DO NOT CHAT. ONLY TRANSLATE.` 
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
                    
                    let audioB64 = null;
                    if (aiText.trim()) {
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

        } catch (e) { console.error("WS Error General:", e.message); }
    });
});