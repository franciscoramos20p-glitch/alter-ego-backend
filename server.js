import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';
import stringSimilarity from 'string-similarity';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🛡️ SERVIDOR V75 (TURBO + STREAMING + VISION): Escuchando en puerto ${PORT}`);

// 🚫 LISTA NEGRA DE ALUCINACIONES (Whisper a veces inventa esto en silencios)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada",
    "Transcribe exactly", "lo que se dice", "Transcribir exactamente", 
    "Direct conversation", "MBC", "SBS"
];

// 💓 HEARTBEAT (Mantiene la conexión viva y limpia clientes muertos)
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.lastAiResponse = ""; 

    ws.on('message', async (message) => {
        try {
            // 1. PARSEO SEGURO
            let data;
            try {
                data = JSON.parse(message);
            } catch (e) {
                console.log("⚠️ Ignorando datos corruptos/no-JSON");
                return;
            }

            // Ignorar eventos de control
            if (data.type === 'start_realtime_session' || data.type === 'ping') return;

            // Configuración dinámica
            const targetVoice = data.voice || "alloy"; 

            // =================================================================
            // 🎙️ AUDIO INPUT (FLUJO PRINCIPAL)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;

                const rawLangA = data.langSource || "Español";
                const rawLangB = data.langTarget || "Inglés";
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // A. WHISPER (Transcribir)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        // El prompt ayuda a Whisper a entender que es un diálogo y no subtítulos
                        prompt: "Conversation. Dialogue. Hola. Hello. Si. No.", 
                        temperature: 0.2 
                    });
                    
                    let userText = transcription.text.trim();
                    
                    // B. FILTROS DE LIMPIEZA (Blindaje)
                    if (userText.length < 2) return; // Ignora ruidos muy cortos
                    if (/(.)\1{4,}/.test(userText)) return; // Filtra "aaaaaa"
                    
                    const lowerText = userText.toLowerCase();
                    if (HALLUCINATION_TRIGGERS.some(trigger => lowerText.includes(trigger.toLowerCase()))) {
                        console.log(`🔇 Alucinación bloqueada: "${userText}"`); 
                        return; 
                    }

                    // Detección de Eco (Si la IA se escucha a sí misma)
                    if (ws.lastAiResponse) {
                        const similarity = stringSimilarity.compareTwoStrings(lowerText, ws.lastAiResponse.toLowerCase());
                        if (similarity > 0.85) { 
                            console.log(`☢️ Eco detectado y silenciado.`); 
                            return; 
                        }
                    }

                    console.log(`🗣️ Usuario: "${userText}"`);

                    // C. GPT-4o (Traducción Inteligente + Streaming)
                    // Usamos streaming para que el usuario vea el texto aparecer rápido
                    const stream = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a PROFESSIONAL SIMULTANEOUS INTERPRETER.
                                CONTEXT: ${rawLangA} <-> ${rawLangB}
                                
                                STRICT RULES:
                                1. Detect the input language automatically.
                                2. If input is ${rawLangA}, translate to ${rawLangB}.
                                3. If input is ${rawLangB}, translate to ${rawLangA}.
                                4. Maintain the tone (formal/casual) and intent.
                                5. OUTPUT ONLY THE TRANSLATION. NO EXPLANATIONS.
                                6. If the input makes no sense or is just noise, output nothing.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                        max_tokens: 250,
                        stream: true // 🔥 ACTIVAMOS STREAMING
                    });

                    let aiText = "";

                    // Procesar el Stream
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            aiText += content;
                            // Enviamos pedacitos de texto a la app para que los pinte en tiempo real
                            ws.send(JSON.stringify({ type: 'stream_chunk', token: content }));
                        }
                    }
                    
                    if (!aiText || aiText.trim().length === 0) return;

                    // Filtro final de eco
                    if (stringSimilarity.compareTwoStrings(aiText.toLowerCase(), userText.toLowerCase()) > 0.9) {
                        console.log("⚠️ Traducción idéntica al original (No se traduce).");
                        return;
                    }

                    console.log(`🧠 Traducción: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // D. TTS (Generar Audio)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: targetVoice, 
                        input: aiText, 
                        response_format: "aac" // AAC es más ligero para móviles
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    
                    // Enviamos respuesta final con audio
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio_payload: bufferTTS.toString('base64') 
                    }));

                } catch (error) { 
                    console.error("❌ Error Live:", error.message);
                    ws.send(JSON.stringify({ type: 'error', message: 'Error de conexión con IA' }));
                }
            }
            
            // =================================================================
            // 📝 TEXT INPUT (CHAT DE TEXTO)
            // =================================================================
            else if (data.type === 'text_input') {
                const systemPrompt = data.tone || `Translate input to ${data.language || 'English'}`; 
                
                try {
                    const stream = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o",
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
                    console.error("❌ Error Chat:", e.message);
                    ws.send(JSON.stringify({ type: 'error', message: 'Error procesando texto' }));
                }
            }
            
            // =================================================================
            // 📸 IMAGE INPUT (VISIÓN - INTACTO)
            // =================================================================
             else if (data.type === 'image_input') {
                 console.log("📸 Procesando imagen...");
                 const langTarget = data.language || "English";
                 
                 try {
                     const response = await openai.chat.completions.create({
                         model: "gpt-4o", 
                         messages: [
                             { 
                                 role: "user", 
                                 content: [
                                     { type: "text", text: `Analyze this image. Identify any text or main objects. Translate the findings to ${langTarget}. Keep it concise.` }, 
                                     { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } }
                                 ] 
                             }
                         ],
                         max_tokens: 200,
                     });
                     
                     const aiText = response.choices[0].message.content;
                     console.log(`👁️ Visión: ${aiText}`);
                     
                     const mp3 = await openai.audio.speech.create({ 
                         model: "tts-1", 
                         voice: targetVoice, 
                         input: aiText, 
                         response_format: 'aac' 
                     });
                     const buffer = Buffer.from(await mp3.arrayBuffer());
                     
                     ws.send(JSON.stringify({ 
                         type: 'full_response', 
                         user_text: "📷 Imagen capturada", 
                         ai_text: aiText, 
                         audio_payload: buffer.toString('base64') 
                     }));

                 } catch (e) {
                     console.error("❌ Error Vision:", e.message);
                     ws.send(JSON.stringify({ type: 'error', message: 'Error analizando imagen' }));
                 }
             }

        } catch (e) { 
            console.error("🔥 Error Crítico WS:", e.message); 
        }
    });
});