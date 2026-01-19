import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';
import stringSimilarity from 'string-similarity';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔑 TU CONTRASEÑA MAESTRA (Cópiala, la necesitarás en la App)
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9"; 

console.log(`🚀 SERVIDOR V75 PRO (BLINDADO TOTAL): Puerto ${PORT}`);

// 🛑 LISTA NEGRA: Frases que Whisper alucina cuando hay silencio
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned", 
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada",
    "Transcribe exactly", "lo que se dice", "Transcribir exactamente", 
    "Direct conversation", "The following is a conversation"
];

// 💓 HEARTBEAT: Mantiene la conexión viva para que Render no la corte
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

// ⚡ LÓGICA DE CONEXIÓN
wss.on('connection', (ws) => {
    console.log(`⚡ Alguien tocó la puerta...`);
    
    ws.isAlive = true;
    ws.isAuthenticated = false; // 🔒 Por defecto, NO entra nadie
    ws.lastAiResponse = ""; 

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        // 1. 🛡️ PROTECCIÓN DE TAMAÑO (Max 10MB)
        // Evita que manden audios de 1 hora para colgar el servidor
        if (message.length > 10 * 1024 * 1024) {
            console.log("🚫 Mensaje gigante bloqueado.");
            return ws.send(JSON.stringify({ type: 'error', message: 'Payload too large' }));
        }

        try {
            // Intenta leer el mensaje
            let data;
            try {
                data = JSON.parse(message);
            } catch (e) { return; } // Si no es JSON, ignora

            // 2. 🛡️ SISTEMA DE AUTENTICACIÓN (EL GUARDIA)
            if (data.type === 'auth') {
                if (data.token === APP_INTERNAL_KEY) {
                    ws.isAuthenticated = true;
                    console.log("✅ Acceso Concedido: Cliente Legítimo");
                    return ws.send(JSON.stringify({ type: 'auth_success' }));
                } else {
                    console.log("❌ Acceso Denegado: Clave Incorrecta");
                    return ws.close(); // Cierra la conexión al intruso
                }
            }

            // ⛔ Si no está autenticado, no procesamos NADA más
            if (!ws.isAuthenticated) return;

            // --- A PARTIR DE AQUÍ, SOLO ENTRA TU APP ---

            if (data.type === 'start_realtime_session') return;

            // Capturar Voz
            const targetVoice = data.voice || "alloy"; 

            // =================================================================
            // 🎙️ MODO AUDIO (LIVE)
            // =================================================================
            if (data.type === 'audio_input') {
                const rawLangA = data.langSource || "Spanish";
                const rawLangB = data.langTarget || "English";
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // A. Transcribir (Whisper)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        prompt: "Hello. Hola. Conversation. Dialogue.", // Contexto para mejorar precisión
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    
                    // B. Filtros de Seguridad (Anti-Alucinación)
                    if (/(.)\1{4,}/.test(userText)) return; // Bloquea "aaaaaa"
                    const lowerText = userText.toLowerCase();
                    
                    if (userText.length < 2 || HALLUCINATION_TRIGGERS.some(t => lowerText.includes(t.toLowerCase()))) {
                        console.log(`🔇 Ruido filtrado: "${userText}"`); return; 
                    }

                    // C. Filtro Anti-Eco (No repetir lo último que dijo la IA)
                    if (ws.lastAiResponse) {
                        const similarity = stringSimilarity.compareTwoStrings(lowerText, ws.lastAiResponse.toLowerCase());
                        if (similarity > 0.85) { console.log(`☢️ Eco silenciado.`); return; }
                    }

                    console.log(`🗣️ Usuario: "${userText}"`);

                    // D. Cerebro Traductor (GPT-4o)
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a STRICT INTERPRETER. 
                                Languages: ${rawLangA} <-> ${rawLangB}.
                                Rules:
                                1. Translate content ACCURATELY.
                                2. If input is ${rawLangA}, output ${rawLangB}.
                                3. If input is ${rawLangB}, output ${rawLangA}.
                                4. Output ONLY the translation. NO notes.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                        max_tokens: 250
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    if (!aiText || aiText === "SILENCE") return;
                    
                    // Doble check de repetición
                    if (aiText.toLowerCase().replace(/\W/g, '') === userText.toLowerCase().replace(/\W/g, '')) {
                        return; // No repetir lo mismo
                    }

                    console.log(`🧠 AI: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // E. Voz (TTS)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: targetVoice, 
                        input: aiText, 
                        response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    
                    // Enviar Audio y Texto (para historial)
                    ws.send(JSON.stringify({ type: 'audio_stream', audio: bufferTTS.toString('base64') }));
                    ws.send(JSON.stringify({ type: 'full_response', user_text: userText, ai_text: aiText, audio_payload: bufferTTS.toString('base64') }));

                } catch (error) { 
                    console.error("❌ Error Live:", error.message);
                    ws.send(JSON.stringify({ type: 'error', message: 'Translation failed' }));
                }
            }
            
            // =================================================================
            // 📝 MODO TEXTO (CHAT CLÁSICO)
            // =================================================================
            else if (data.type === 'text_input') {
                // Límite de caracteres para chat (500 chars)
                const cleanText = data.text.substring(0, 500);
                
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: data.tone || "Translate." }, 
                            { role: "user", content: cleanText }
                        ],
                        model: "gpt-4o-mini"
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;
                    
                    // Generar audio de la respuesta
                    const mp3 = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: targetVoice, 
                        input: aiText, 
                        response_format: 'aac' 
                    });
                    
                    ws.send(JSON.stringify({ type: 'full_response', user_text: cleanText, ai_text: aiText, audio_payload: Buffer.from(await mp3.arrayBuffer()).toString('base64') }));
                } catch(e) { ws.send(JSON.stringify({ type: 'error' })); }
            }
            
            // =================================================================
            // 📸 MODO VISIÓN (CÁMARA)
            // =================================================================
             else if (data.type === 'image_input') {
                 try {
                     const response = await openai.chat.completions.create({
                         model: "gpt-4o", 
                         messages: [{ 
                             role: "user", 
                             content: [
                                 { type: "text", text: `Analyze this image. Translate any text found to ${data.language}. If no text, describe the scene in ${data.language}.` }, 
                                 { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } }
                             ] 
                         }],
                         max_tokens: 200,
                     });
                     const aiText = response.choices[0].message.content;
                     
                     const mp3 = await openai.audio.speech.create({ 
                         model: "tts-1", 
                         voice: targetVoice, 
                         input: aiText, 
                         response_format: 'aac' 
                     });
                     
                     ws.send(JSON.stringify({ type: 'full_response', user_text: "📸 [Imagen]", ai_text: aiText, audio_payload: Buffer.from(await mp3.arrayBuffer()).toString('base64') }));
                 } catch (e) { ws.send(JSON.stringify({ type: 'error' })); }
             }

        } catch (e) { console.error("WS Error Crítico:", e.message); }
    });
});