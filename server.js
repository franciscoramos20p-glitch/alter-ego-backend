import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';
import stringSimilarity from 'string-similarity';

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V91 [TURBO LIVE]: GPT-4o-Mini (Velocidad Extrema) + AAC. Puerto: ${PORT}`);

// 🛡️ LISTA NEGRA (Anti-Basura)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada",
    "Transcribe exactly", "lo que se dice", "Transcribir exactamente", 
    "Direct conversation", "MBC", "SBS"
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
wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);
    ws.isAlive = true;
    ws.lastAiResponse = ""; 

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'start_realtime_session' || data.type === 'ping') return;
            
            if (data.type === 'auth') {
                ws.send(JSON.stringify({ type: 'auth_success', credits: 999 })); 
                return;
            }

            const targetVoice = data.voice || "alloy"; 

            // =================================================================
            // 🎙️ AUDIO INPUT (LIVE - OPTIMIZADO PARA VELOCIDAD)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;

                const rawLangA = data.langSource || "Español";
                const rawLangB = data.langTarget || "Inglés";
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 1. WHISPER (Detecta Idioma Rápido)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        response_format: "verbose_json", // Para ver idioma en consola
                        prompt: "Conversation. Dialogue. Hola. Hello.", 
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    let detectedLang = transcription.language; 

                    // LOG DE VERIFICACIÓN
                    console.log(`🌍 [${detectedLang}] Detectado | Texto: "${userText}"`);
                    
                    // Filtros Rápidos
                    if (userText.length < 2) return; 
                    if (HALLUCINATION_TRIGGERS.some(t => userText.toLowerCase().includes(t.toLowerCase()))) {
                        console.log(`🔇 Basura.`); return; 
                    }
                    if (ws.lastAiResponse && stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase()) > 0.85) return;

                    // 2. GPT-4o-MINI (EL CAMBIO CLAVE PARA VELOCIDAD)
                    // Usamos Mini porque es infinitamente más rápido traduciendo frases cortas
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `STRICT TRANSLATOR. 
                                Languages: ${rawLangA} <-> ${rawLangB}.
                                Rule: Detect input language -> Translate to the other.
                                Output: TRANSLATION ONLY. NO CHAT.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o-mini", // 🔥 AQUÍ ESTÁ LA VELOCIDAD
                        max_tokens: 200, 
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    if (!aiText || aiText === "SILENCE") return;
                    
                    if (stringSimilarity.compareTwoStrings(aiText.toLowerCase(), userText.toLowerCase()) > 0.9) return;

                    console.log(`🚀 Trad: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 3. TTS (Audio Rápido AAC)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", // Modelo rápido
                        voice: targetVoice, 
                        input: aiText, 
                        response_format: "aac" // Formato ligero
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    
                    // ⚡ ENVÍO INMEDIATO
                    ws.send(JSON.stringify({ type: 'audio_stream', audio: bufferTTS.toString('base64') }));
                    
                    // Guardar en historial App
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
            // 📝 CHAT DE TEXTO (CLASSIC - CON MODOS)
            // =================================================================
            else if (data.type === 'text_input') {
                const systemPrompt = data.tone || `Translate input.`; 
                try {
                    // Aquí usamos streaming para efecto visual
                    const stream = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini",
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
                    
                    // Audio opcional
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
                } catch(e) {}
            }

        } catch (e) { console.error("🔥 WS Error:", e.message); }
    });
});