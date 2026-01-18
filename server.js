import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';
import stringSimilarity from 'string-similarity';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V74 (BLINDADO + FEEDBACK DE ERROR): Puerto ${PORT}`);

// 🛡️ LISTA NEGRA DE ALUCINACIONES DE WHISPER
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada",
    "Transcribe exactly", "lo que se dice", "Transcribir exactamente", "Direct conversation"
];

// 💓 HEARTBEAT: Mantiene la conexión viva en Render
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
    ws.on('pong', () => { ws.isAlive = true; }); // Responde al latido
    ws.lastAiResponse = ""; 

    ws.on('message', async (message) => {
        try {
            // 🛡️ PROTECCIÓN JSON: Evita caídas por datos corruptos
            let data;
            try {
                data = JSON.parse(message);
            } catch (e) {
                console.log("⚠️ JSON Inválido recibido");
                return;
            }

            if (data.type === 'start_realtime_session') return;

            // 🔥 CAPTURAMOS LA VOZ DINÁMICA
            const targetVoice = data.voice || "alloy"; 

            // =================================================================
            // 🎙️ AUDIO INPUT (LIVE - TRADUCCIÓN RÁPIDA)
            // =================================================================
            if (data.type === 'audio_input') {
                const rawLangA = data.langSource || data.my_lang || "Español";
                const rawLangB = data.langTarget || data.target_lang_code || "Inglés";
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 1. WHISPER (Oído)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        prompt: "Hello. Hola. Conversation. Dialogue. Si. No.", 
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    
                    // 🛡️ FILTROS DE ALUCINACIÓN Y REPETICIÓN
                    if (/(.)\1{4,}/.test(userText)) return; // Filtra "aaaaaa"
                    const lowerText = userText.toLowerCase();
                    
                    if (userText.length === 0 || HALLUCINATION_TRIGGERS.some(trigger => lowerText.includes(trigger.toLowerCase()))) {
                        console.log(`🔇 Basura bloqueada: "${userText}"`); return; 
                    }

                    if (ws.lastAiResponse) {
                        const similarity = stringSimilarity.compareTwoStrings(lowerText, ws.lastAiResponse.toLowerCase());
                        if (similarity > 0.85) { console.log(`☢️ Eco detectado.`); return; }
                    }

                    console.log(`🗣️ Oído: "${userText}"`);

                    // 2. GPT-4o (Cerebro Traductor)
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
                    
                    // Doble verificación de eco
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
                    
                    ws.send(JSON.stringify({ type: 'audio_stream', audio: bufferTTS.toString('base64') }));
                    ws.send(JSON.stringify({ type: 'full_response', user_text: userText, ai_text: aiText, audio_payload: bufferTTS.toString('base64') }));

                } catch (error) { 
                    console.error("❌ Error en Live:", error.message);
                    // 🛡️ AVISAR A LA APP QUE HUBO ERROR
                    ws.send(JSON.stringify({ type: 'error', message: 'Error de traducción' }));
                }
            }
            
            // =================================================================
            // 📝 CHAT DE TEXTO (INCLUYE MODOS BARRIO/FORMAL)
            // =================================================================
            else if (data.type === 'text_input') {
                const systemPrompt = data.tone || `Translate from ${data.my_lang} to ${data.language}`; 
                
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini"
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
                    
                    ws.send(JSON.stringify({ type: 'full_response', user_text: data.text, ai_text: aiText, audio_payload: buffer.toString('base64') }));
                } catch(e) {
                    console.error("❌ Error en Chat:", e.message);
                    ws.send(JSON.stringify({ type: 'error', message: 'Error de texto' }));
                }
            }
            
            // =================================================================
            // 📸 CÁMARA (VISION)
            // =================================================================
             else if (data.type === 'image_input') {
                 const langTarget = data.language || "English";
                 try {
                     const response = await openai.chat.completions.create({
                         model: "gpt-4o", 
                         messages: [{ role: "user", content: [{ type: "text", text: `Look for ANY text in this image. If found, TRANSLATE it to ${langTarget}. If there is NO text, briefly describe what you see in ${langTarget}. Output ONLY the result.` }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } }] }],
                         max_tokens: 150,
                     });
                     const aiText = response.choices[0].message.content;
                     
                     const mp3 = await openai.audio.speech.create({ 
                         model: "tts-1", 
                         voice: targetVoice, 
                         input: aiText, 
                         response_format: 'aac' 
                     });
                     const buffer = Buffer.from(await mp3.arrayBuffer());
                     
                     ws.send(JSON.stringify({ type: 'full_response', user_text: "📸 [Imagen Analizada]", ai_text: aiText, audio_payload: buffer.toString('base64') }));
                 } catch (e) {
                     console.error("❌ Error en Vision:", e.message);
                     ws.send(JSON.stringify({ type: 'error', message: 'Error de imagen' }));
                 }
             }

        } catch (e) { console.error("WS Error General:", e.message); }
    });
});