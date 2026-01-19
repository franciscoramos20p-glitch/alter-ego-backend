import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';
import stringSimilarity from 'string-similarity';

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V85 [RESTAURACIÓN V73]: Lógica original + Fix Render. Puerto: ${PORT}`);

// 🛡️ LISTA NEGRA (Tu lista original V73)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada",
    "Transcribe exactly", "lo que se dice", "Transcribir exactamente", 
    "Direct conversation"
];

// 💓 HEARTBEAT (ESTO ES NUEVO Y NECESARIO)
// Mantiene la conexión viva para que Render no te desconecte a los 30s
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

    // Responder al latido
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            // 🛡️ PARSEO SEGURO
            let data;
            try {
                data = JSON.parse(message);
            } catch (e) {
                return; // Ignora basura
            }

            if (data.type === 'start_realtime_session' || data.type === 'ping') return;
            
            // Simulación de Auth para que la app no se quede esperando
            if (data.type === 'auth') {
                ws.send(JSON.stringify({ type: 'auth_success', credits: 999 })); 
                return;
            }

            const targetVoice = data.voice || "alloy"; 

            // =================================================================
            // 🎙️ AUDIO INPUT (LÓGICA V73 EXACTA)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;

                const rawLangA = data.langSource || data.my_lang || "Español";
                const rawLangB = data.langTarget || data.target_lang_code || "Inglés";
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 1. WHISPER (Igual que V73)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        prompt: "Hello. Hola. Conversation. Dialogue. Si. No.", 
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    
                    // 🛡️ FILTROS V73
                    if (/(.)\1{4,}/.test(userText)) return; 
                    const lowerText = userText.toLowerCase();
                    if (userText.length === 0 || HALLUCINATION_TRIGGERS.some(trigger => lowerText.includes(trigger.toLowerCase()))) {
                        console.log(`🔇 Basura bloqueada: "${userText}"`); return; 
                    }

                    if (ws.lastAiResponse) {
                        const similarity = stringSimilarity.compareTwoStrings(lowerText, ws.lastAiResponse.toLowerCase());
                        if (similarity > 0.85) { console.log(`☢️ Eco detectado.`); return; }
                    }

                    console.log(`🗣️ Oído: "${userText}"`);

                    // 2. GPT-4o (LÓGICA V73 - SIN STREAMING)
                    // Volvemos al modo "esperar respuesta completa" para que Live funcione como antes
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a STRICT BIDIRECTIONAL INTERPRETER.
                                LANGUAGES: ${rawLangA} <-> ${rawLangB}
                                ALGORITHM:
                                1. IDENTIFY input language.
                                2. SWITCH to the OTHER language.
                                3. OUTPUT only the translation.
                                RULES:
                                - Translate EVERYTHING.
                                - NEVER output the same language as input.
                                - If noise, output "SILENCE".` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                        max_tokens: 200
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    if (aiText === "SILENCE" || !aiText || aiText.trim().length === 0) return;
                    
                    // Anti-repetición exacta
                    if (aiText.toLowerCase().replace(/[.,!¡¿?]/g, '').trim() === userText.toLowerCase().replace(/[.,!¡¿?]/g, '').trim()) {
                        console.log("⚠️ Intento de repetición bloqueado."); return;
                    }

                    console.log(`🧠 Trad: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 3. TTS (Voz)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: targetVoice, 
                        input: aiText, 
                        response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    
                    // 🔥 RESPUESTA EXACTA V73
                    // Primero el stream de audio
                    ws.send(JSON.stringify({ type: 'audio_stream', audio: bufferTTS.toString('base64') }));
                    // Luego la respuesta completa con texto
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio_payload: bufferTTS.toString('base64') 
                    }));

                } catch (error) { 
                    console.error("❌ Error Live:", error.message);
                }
            }
            
            // =================================================================
            // 📝 CHAT DE TEXTO (V73 + Mejoras V80)
            // =================================================================
            else if (data.type === 'text_input') {
                const systemPrompt = data.tone || `Translate from ${data.my_lang} to ${data.language}`; 
                
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini" // Mini es suficiente y rápido para texto
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;
                    
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
                } catch(e) {
                    console.error("❌ Error Texto:", e.message);
                }
            }

        } catch (e) { 
            console.error("🔥 Error WS General:", e.message); 
        }
    });
});