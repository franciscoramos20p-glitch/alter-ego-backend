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

console.log(`🏆 SERVIDOR LIVE V3.0 (FIXED): Puerto ${PORT}`);

// 🎭 MAPEO DE VOCES (Frontend -> Deepgram Aura)
const VOICE_MAP = {
    "alloy": "aura-orion-en",   // Masculino
    "echo": "aura-arcas-en",    // Masculino Profundo
    "fable": "aura-athena-en",  // Femenino UK
    "onyx": "aura-perseus-en",  // Masculino Grave
    "nova": "aura-asteria-en",  // Femenino (Default)
    "shimmer": "aura-luna-en"   // Femenino Suave
};

// 🚫 LISTA NEGRA (Filtrado de basura)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Translated by", "watching", 
    "Please subscribe", "sous-titres", "captioned", 
    "Solo ves lo que puedes ver", "Gracias por ver", 
    "copyright", "All rights reserved", "suscríbete", 
    "videoplayback", "MBC", "SBS", "Al Jazeera", "TEDx",
    "999", "1234", "00:00", ". . .", "..."
];

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
            if (now - ws.lastMessageTime < 50) return; 
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            // 1. AUTH
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) {
                    ws.close();
                    return;
                }
                ws.send(JSON.stringify({ type: 'auth_success' })); 
                return;
            }

            // 2. AUDIO INPUT
            if (data.type === 'audio_input') {
                if (!data.payload) return;

                const langA = data.langSource || "Spanish";
                const langB = data.langTarget || "English";
                const isFastMode = data.fastMode === true; 
                const requestedVoice = data.voice || "nova";
                const targetVoiceModel = VOICE_MAP[requestedVoice] || "aura-asteria-en";

                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // A) TRANSCRIPCIÓN (STT)
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

                    // --- FILTROS DE LIMPIEZA ---
                    if (userText.length < 2) return; 
                    if (HALLUCINATION_TRIGGERS.some(t => userText.toLowerCase().includes(t.toLowerCase()))) return;
                    
                    // Evitar procesar lo que la propia IA acaba de decir (Eco)
                    if (ws.lastAiResponse && stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase()) > 0.8) {
                        console.log("🔁 Eco detectado, ignorando.");
                        return;
                    }

                    console.log(`🗣️ [Input]: "${userText}" (${langA} <-> ${langB})`);

                    // B) TRADUCCIÓN (CEREBRO) - FIX CRÍTICO AQUÍ
                    // Hemos cambiado el prompt para obligar a NO repetir el idioma de entrada.
                    const systemPrompt = `
                    You are a TRANSLATOR. 
                    Context: A conversation between ${langA} and ${langB}.
                    
                    TASK:
                    1. Identify the language of the INPUT text.
                    2. If INPUT is ${langA} -> Translate to ${langB}.
                    3. If INPUT is ${langB} -> Translate to ${langA}.
                    
                    CRITICAL RULES:
                    - OUTPUT ONLY THE TRANSLATION. 
                    - NEVER REPEAT THE INPUT TEXT.
                    - NEVER EXPLAIN ("Here is the translation...").
                    - IF INPUT IS UNINTELLIGIBLE, OUTPUT "SILENCE".
                    `;

                    const completion = await groq.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt }, 
                            { role: "user", content: userText }
                        ],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.1, // Mantenemos bajo para precisión
                        max_tokens: 256
                    });
                    
                    let aiText = completion.choices[0].message.content.trim();

                    // --- VALIDACIÓN ANTI-REPETICIÓN ---
                    // Si la IA devuelve lo mismo que entró (ej: Input "Hola" -> Output "Hola"), lo bloqueamos.
                    // Esto arregla el bug de la foto 9.
                    if (!aiText || aiText === "SILENCE" || aiText.length < 1) return;
                    
                    const similarity = stringSimilarity.compareTwoStrings(userText.toLowerCase(), aiText.toLowerCase());
                    if (similarity > 0.85) {
                        console.log("⚠️ Alerta: La IA intentó repetir el texto. Bloqueado.");
                        return; // No enviamos nada si es una repetición
                    }

                    // Limpieza de prefijos
                    aiText = aiText.replace(/^(Translation:|Note:|Here is):?/gi, "").trim();

                    console.log(`🧠 [Output]: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // C) GENERACIÓN DE VOZ (TTS)
                    let audioB64 = null;

                    if (isFastMode) {
                        // MODO FLASH: Solo texto, el celular habla
                        audioB64 = null; 
                    } else {
                        // MODO HQ: Audio servidor
                        try {
                            const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoiceModel}`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ text: aiText })
                            });

                            if (response.ok) {
                                const arrayBuffer = await response.arrayBuffer();
                                audioB64 = Buffer.from(arrayBuffer).toString('base64');
                            }
                        } catch (err) { console.error("Error TTS:", err); }
                    }

                    // D) ENVIAR RESPUESTA
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));

                } catch (error) { console.error("❌ Error Proceso:", error.message); }
            }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});