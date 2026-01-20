import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';
import stringSimilarity from 'string-similarity';

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔑 LLAVE DE SEGURIDAD (Coincide con tu ClassicConfig.js)
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";

console.log(`🏆 SERVIDOR PRO V97: Live(4o) | Chat(Mini) | Strict Translator. Puerto: ${PORT}`);

// 🚫 LISTA NEGRA (Anti-Basura)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada",
    "Transcribe exactly", "lo que se dice", "Transcribir exactamente", 
    "Direct conversation", "MBC", "SBS", "Al Jazeera"
];

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
            // Anti-DDoS
            const now = Date.now();
            if (now - ws.lastMessageTime < 100) return; 
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'start_realtime_session' || data.type === 'ping') return;
            
            // Autenticación (Anti-Hacker)
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) {
                    console.log("⛔ Intruso bloqueado (Token inválido).");
                    ws.close();
                    return;
                }
                ws.send(JSON.stringify({ type: 'auth_success', credits: 999 })); 
                return;
            }

            const targetVoice = data.voice || "alloy"; 
            const langNameA = data.langSource || "Spanish"; 
            const langNameB = data.langTarget || "English"; 

            // =================================================================
            // 🎙️ MODO LIVE (PREMIUM - GPT-4o - ESTRICTO)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 1. WHISPER (Con contexto para evitar errores)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        response_format: "verbose_json",
                        prompt: `Conversation in ${langNameA} or ${langNameB}.`, 
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    let detectedLang = transcription.language;

                    // 🛡️ Filtros Anti-Basura
                    if (userText.length < 2) return; 
                    if (HALLUCINATION_TRIGGERS.some(t => userText.toLowerCase().includes(t.toLowerCase()))) {
                        console.log(`🔇 Basura bloqueada.`); return; 
                    }
                    if (ws.lastAiResponse && stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase()) > 0.85) return;

                    console.log(`🗣️ [Live | ${detectedLang}] Usuario: "${userText}"`);

                    // 2. GPT-4o (CEREBRO TRADUCTOR - NO CHARLA)
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `YOU ARE A STRICT TRANSLATION ENGINE.
                                LANGUAGES: ${langNameA} <-> ${langNameB}.
                                
                                RULES:
                                1. Translate ONLY. Do not chat. Do not answer questions.
                                2. If input is ${langNameA} -> Translate to ${langNameB}.
                                3. If input is ${langNameB} -> Translate to ${langNameA}.
                                4. NEVER repeat the input language.
                                5. If audio is unintelligible, output "SILENCE".` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o", // 🔥 Máxima Calidad
                        max_tokens: 300,
                        temperature: 0.2
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    if (!aiText || aiText === "SILENCE") return;

                    // Anti-repetición (Si devuelve lo mismo, es error)
                    if (stringSimilarity.compareTwoStrings(aiText.toLowerCase(), userText.toLowerCase()) > 0.95) {
                        console.log("⚠️ Traducción idéntica (Bloqueada).");
                        return;
                    }

                    console.log(`🧠 Trad: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 3. TTS (Generar Audio)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", voice: targetVoice, input: aiText, response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    
                    // A. Enviar Audio
                    ws.send(JSON.stringify({ type: 'audio_stream', audio: bufferTTS.toString('base64') }));
                    
                    // B. Enviar Historial (Full Response)
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio_payload: bufferTTS.toString('base64') 
                    }));

                } catch (error) { console.error("❌ Live Error:", error.message); }
            }
            
            // =================================================================
            // 📝 MODO CLASSIC (TEXTO - GPT-4o MINI - ESTRICTO)
            // =================================================================
            else if (data.type === 'text_input') {
                const requestedTone = data.tone || "Neutral";
                
                try {
                    console.log(`📝 Texto: "${data.text}"`);

                    const stream = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `YOU ARE A TRANSLATOR.
                                LANGUAGES: ${langNameA} <-> ${langNameB}.
                                TONE: ${requestedTone}.
                                RULES:
                                1. Translate ONLY. Do not chat.
                                2. If ${langNameA} -> ${langNameB}. If ${langNameB} -> ${langNameA}.` 
                            }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini", // 🔥 Velocidad para chat
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
                        const mp3 = await openai.audio.speech.create({ 
                            model: "tts-1", voice: targetVoice, input: aiText, response_format: 'aac' 
                        });
                        const buffer = Buffer.from(await mp3.arrayBuffer());
                        audioB64 = buffer.toString('base64');
                    }

                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: data.text, 
                        ai_text: aiText, 
                        audio_payload: audioB64 
                    }));
                } catch(e) { console.error("Classic Error:", e.message); }
            }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});