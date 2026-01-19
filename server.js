// ✅ USAMOS 'require' PARA EVITAR ERRORES DE IMPORTACIÓN
const { WebSocketServer } = require('ws');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const { toFile } = require('openai'); // Extraemos toFile correctamente
const stringSimilarity = require('string-similarity');

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V82 [LIGERO]: Sin Firebase, Sin Cámara, Compatible CommonJS. Puerto: ${PORT}`);

// 🛡️ LISTA NEGRA DE ALUCINACIONES (Anti-Basura)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada",
    "Transcribe exactly", "lo que se dice", "Transcribir exactamente", 
    "Direct conversation", "MBC", "SBS"
];

// 💓 HEARTBEAT (Mantiene la conexión viva en Render)
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
            // Parseo seguro del JSON
            let data;
            try {
                data = JSON.parse(message);
            } catch (e) {
                return; // Ignoramos basura
            }

            // Ignorar eventos de control
            if (data.type === 'start_realtime_session' || data.type === 'ping') return;
            if (data.type === 'auth') {
                // Si la app manda auth, respondemos éxito directo (ya que no hay firebase)
                ws.send(JSON.stringify({ type: 'auth_success', credits: 9999 })); 
                return;
            }

            // Capturar voz seleccionada por el usuario
            const targetVoice = data.voice || "alloy"; 

            // =================================================================
            // 🎙️ AUDIO INPUT (LIVE - TRADUCCIÓN RÁPIDA)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;

                const rawLangA = data.langSource || "Español";
                const rawLangB = data.langTarget || "Inglés";
                // Convertir Base64 a Buffer
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 1. WHISPER (Oído Universal)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        prompt: "Conversation. Dialogue. Hola. Hello. Si. No.", 
                        temperature: 0.2 
                    });
                    
                    let userText = transcription.text.trim();
                    
                    // 🛡️ FILTROS DE LIMPIEZA
                    if (userText.length < 2) return; // Muy corto
                    if (HALLUCINATION_TRIGGERS.some(trigger => userText.toLowerCase().includes(trigger.toLowerCase()))) {
                        console.log(`🔇 Basura bloqueada: "${userText}"`); return; 
                    }

                    // Anti-Eco (Si se escucha a sí mismo)
                    if (ws.lastAiResponse) {
                        const similarity = stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase());
                        if (similarity > 0.85) return;
                    }

                    console.log(`🗣️ Oído: "${userText}"`);

                    // 2. GPT-4o (Cerebro Traductor + Streaming)
                    const stream = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a STRICT BIDIRECTIONAL INTERPRETER.
                                LANGUAGES: ${rawLangA} <-> ${rawLangB}
                                RULES:
                                1. Detect input language automatically.
                                2. If input is ${rawLangA} -> Translate to ${rawLangB}.
                                3. If input is ${rawLangB} -> Translate to ${rawLangA}.
                                4. OUTPUT ONLY TRANSLATION. NO CHAT.
                                5. If noise/silence, output NOTHING.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                        max_tokens: 300,
                        stream: true // 🔥 STREAMING ACTIVADO
                    });

                    let aiText = "";

                    // Enviamos letra por letra a la App
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            aiText += content;
                            ws.send(JSON.stringify({ type: 'stream_chunk', token: content }));
                        }
                    }
                    
                    if (!aiText || aiText.trim().length === 0) return;

                    // Filtro final de eco
                    if (stringSimilarity.compareTwoStrings(aiText.toLowerCase(), userText.toLowerCase()) > 0.9) return;

                    console.log(`🧠 Trad: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 3. TTS (Generar Audio)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: targetVoice, 
                        input: aiText, 
                        response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    
                    // Enviamos el historial completo para que la app lo pinte
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio_payload: bufferTTS.toString('base64') 
                    }));

                } catch (error) { 
                    console.error("❌ Error Live:", error.message);
                    // Opcional: Avisar error a la app
                    ws.send(JSON.stringify({ type: 'error', message: 'Error traducción' }));
                }
            }
            
            // =================================================================
            // 📝 CHAT DE TEXTO (GPT-4o MINI)
            // =================================================================
            else if (data.type === 'text_input') {
                const systemPrompt = data.tone || `Translate input.`; 
                
                try {
                    const stream = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini", // Mini para texto
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
                    
                    // Generar Audio si hay texto
                    if (aiText.trim()) {
                        const mp3 = await openai.audio.speech.create({ 
                            model: "tts-1", 
                            voice: targetVoice, 
                            input: aiText, 
                            response_format: 'aac' 
                        });
                        const buffer = Buffer.from(await mp3.arrayBuffer());
                        
                        ws.send(JSON.stringify({ 
                            type: 'full_response', 
                            user_text: data.text, 
                            ai_text: aiText, 
                            audio_payload: buffer.toString('base64') 
                        }));
                    }
                } catch(e) {
                    console.error("❌ Error Texto:", e.message);
                }
            }
            
        } catch (e) { 
            console.error("🔥 Error WS General:", e.message); 
        }
    });
});