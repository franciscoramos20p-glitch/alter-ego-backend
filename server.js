import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';
import stringSimilarity from 'string-similarity';

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔑 LLAVE MAESTRA (Seguridad Anti-Hacker)
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";

console.log(`🚀 SERVIDOR V88 [MAESTRO]: Live V73 (Audio) + Classic (Stream) + Security. Puerto: ${PORT}`);

// 🛡️ LISTA NEGRA (Anti-Alucinaciones)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada",
    "Transcribe exactly", "lo que se dice", "Transcribir exactamente", 
    "Direct conversation"
];

// 💓 HEARTBEAT (Estabilidad de conexión)
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
    ws.userId = "UNKNOWN"; 
    ws.lastMessageTime = 0; // Variable Anti-DDoS
    ws.lastAiResponse = ""; 

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            // 🛡️ 1. ANTI-DDOS (Protección de Carga Masiva)
            const now = Date.now();
            if (now - ws.lastMessageTime < 150) return; // Si spamean <150ms, ignorar
            ws.lastMessageTime = now;

            // Parseo Seguro
            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'start_realtime_session' || data.type === 'ping') return;
            
            // 🛡️ 2. AUTENTICACIÓN (Anti-Hacker)
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) {
                    console.log(`⛔ Intruso bloqueado: ${req.socket.remoteAddress}`);
                    ws.close(); // Patea al hacker
                    return;
                }
                ws.send(JSON.stringify({ type: 'auth_success', credits: 9999 })); 
                return;
            }

            const targetVoice = data.voice || "alloy"; 

            // =================================================================
            // 🎙️ AUDIO INPUT (LIVE - MODO V73 PURO - SOLO AUDIO)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;

                const rawLangA = data.langSource || "Español";
                const rawLangB = data.langTarget || "Inglés";
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // A. WHISPER (Oído)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        prompt: "Hello. Hola. Conversation. Dialogue.", 
                        temperature: 0.2 
                    });
                    
                    let userText = transcription.text.trim();
                    
                    // Filtros
                    if (/(.)\1{4,}/.test(userText)) return; 
                    const lowerText = userText.toLowerCase();
                    if (userText.length < 2 || HALLUCINATION_TRIGGERS.some(t => lowerText.includes(t.toLowerCase()))) {
                        console.log(`🔇 Basura: "${userText}"`); return; 
                    }
                    if (ws.lastAiResponse && stringSimilarity.compareTwoStrings(lowerText, ws.lastAiResponse.toLowerCase()) > 0.85) return;

                    console.log(`🗣️ Live: "${userText}"`);

                    // B. GPT-4o (SIN STREAMING - Lógica V73)
                    // Esperamos la traducción completa para generar el audio más rápido y seguro
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a STRICT INTERPRETER.
                                LANGUAGES: ${rawLangA} <-> ${rawLangB}
                                RULES:
                                1. Detect language automatically.
                                2. Translate to OTHER language.
                                3. OUTPUT ONLY TRANSLATION. NO CHAT.
                                4. If noise, output "SILENCE".` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                        max_tokens: 300
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    if (aiText === "SILENCE" || !aiText || aiText.trim().length === 0) return;
                    
                    // Anti-Repetición
                    if (aiText.toLowerCase().replace(/[.,!¡¿?]/g, '').trim() === userText.toLowerCase().replace(/[.,!¡¿?]/g, '').trim()) return;

                    console.log(`🧠 Trad: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // C. TTS (Audio)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: targetVoice, 
                        input: aiText, 
                        response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    
                    // 🚀 RESPUESTA (Prioridad Audio)
                    // 1. Audio stream inmediato (para que suene YA)
                    ws.send(JSON.stringify({ type: 'audio_stream', audio: bufferTTS.toString('base64') }));
                    
                    // 2. Datos para el historial de la App
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio_payload: bufferTTS.toString('base64') 
                    }));

                } catch (error) { 
                    console.error("❌ Live Error:", error.message);
                }
            }
            
            // =================================================================
            // 📝 TEXT INPUT (CLASSIC - CON STREAMING Y MODOS)
            // =================================================================
            else if (data.type === 'text_input') {
                // Aquí recibimos el "tone" (Coqueto, Barrio, etc.) desde la App
                const systemPrompt = data.tone || `Translate input.`; 
                
                try {
                    // GPT-4o Mini CON STREAMING (Letritas)
                    const stream = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini", // Mini para ahorrar en chat
                        stream: true // 🔥 Activado solo para texto
                    });

                    let aiText = "";
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            aiText += content;
                            // Enviamos letra por letra
                            ws.send(JSON.stringify({ type: 'stream_chunk', token: content }));
                        }
                    }
                    ws.lastAiResponse = aiText;
                    
                    // Generar Audio opcional (para el botón de play del chat)
                    let audioB64 = null;
                    if (aiText.trim()) {
                        const mp3 = await openai.audio.speech.create({ 
                            model: "tts-1", voice: targetVoice, input: aiText, response_format: 'aac' 
                        });
                        const buffer = Buffer.from(await mp3.arrayBuffer());
                        audioB64 = buffer.toString('base64');
                    }

                    // Enviar historial final
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: data.text, 
                        ai_text: aiText, 
                        audio_payload: audioB64 
                    }));
                } catch(e) {
                    console.error("❌ Text Error:", e.message);
                }
            }

        } catch (e) { console.error("🔥 WS Error:", e.message); }
    });
});