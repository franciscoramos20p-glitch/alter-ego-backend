import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import stringSimilarity from 'string-similarity'; // 🔥 MANTENIDO: ANTI-ECO

dotenv.config();
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR MAESTRO V65 (BIDIRECCIONAL REAL + CÁMARA TEXTO): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🗑️ LISTA NEGRA (Anti-Alucinaciones)
const IGNORE_LIST = [
    "Subtitles by", "Amara.org", "Community", "Translated by", "MBC", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Silence", "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete"
];

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);
    ws.lastAiResponse = ""; 

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start_realtime_session') return;

            // =================================================================
            // 🎙️ AUDIO INPUT (LIVE & CLÁSICO)
            // =================================================================
            if (data.type === 'audio_input') {
                const rawLangA = data.langSource || data.my_lang || "Español";
                const rawLangB = data.langTarget || data.target_lang_code || "Inglés";
                
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                
                try {
                    fs.writeFileSync(tempIn, inputBuffer);

                    // A. WHISPER (MODO AUTO-DETECT)
                    // 🔥 IMPORTANTE: Quitamos "language: isoCode" para que Whisper detecte 
                    // si hablas en Español O en Inglés automáticamente.
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        // language: isoCode, <--- BORRADO PARA PERMITIR BIDIRECCIONALIDAD REAL
                        prompt: "Conversation, verbatim, no subtitles.", 
                        temperature: 0 
                    });
                    
                    const userText = transcription.text.trim();
                    
                    // B. FILTROS DE SEGURIDAD (MANTENIDOS)
                    if (userText.length < 2 || IGNORE_LIST.some(x => userText.toLowerCase().includes(x.toLowerCase()))) {
                        console.log(`🔇 Basura ignorada.`); try { fs.unlinkSync(tempIn); } catch(e){} return; 
                    }

                    // ANTI-ECO
                    if (ws.lastAiResponse) {
                        const similarity = stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase());
                        if (similarity > 0.4 || userText.toLowerCase().includes(ws.lastAiResponse.toLowerCase().slice(0, 25))) {
                            console.log(`☢️ ECO DETECTADO: "${userText}"`);
                            try { fs.unlinkSync(tempIn); } catch(e){} return; 
                        }
                    }

                    console.log(`🗣️ Oído: "${userText}"`);

                    // C. CEREBRO TRADUCTOR (LÓGICA BIDIRECCIONAL)
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a STRICT INTERPRETER for these two languages:
                                1. ${rawLangA}
                                2. ${rawLangB}

                                LOGIC RULES:
                                - If the input is in ${rawLangA} => Translate to ${rawLangB}.
                                - If the input is in ${rawLangB} => Translate to ${rawLangA}.
                                - NEVER repeat the input in the same language.
                                - NO explanation. NO conversation. JUST the translation.
                                - If the input is noise or silence, return "SILENCE".` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                        max_tokens: 200
                    });
                    
                    const aiText = completion.choices[0].message.content;

                    if (aiText === "SILENCE" || !aiText || aiText.trim().length === 0) {
                        try { fs.unlinkSync(tempIn); } catch(e){} return;
                    }

                    console.log(`🧠 Trad: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // D. VOZ (TTS)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", voice: "alloy", input: aiText, response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    const audioBase64 = bufferTTS.toString('base64');

                    ws.send(JSON.stringify({ type: 'audio_stream', audio: audioBase64 }));
                    ws.send(JSON.stringify({ type: 'full_response', user_text: userText, ai_text: aiText, audio_payload: audioBase64 }));

                    try { fs.unlinkSync(tempIn); } catch(e){}

                } catch (error) { try { fs.unlinkSync(tempIn); } catch(e){} }
            }
            
            // =================================================================
            // 📝 CHAT INPUT (TEXTO)
            // =================================================================
            else if (data.type === 'text_input') {
                const langA = data.my_lang || "Español";
                const langB = data.language || "Inglés";
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `Translate the following text from ${langA} to ${langB} (or vice versa if detected). Output ONLY the translation.` 
                            }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini"
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;
                    
                    const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                    const buffer = Buffer.from(await mp3.arrayBuffer());
                    
                    ws.send(JSON.stringify({ type: 'full_response', user_text: data.text, ai_text: aiText, audio_payload: buffer.toString('base64') }));
                } catch(e) {}
            }
            
            // =================================================================
            // 📸 IMAGE INPUT (SOLUCIÓN CÁMARA)
            // =================================================================
             else if (data.type === 'image_input') {
                 const langTarget = data.language || "English";
                 console.log("📸 Procesando imagen para traducir al:", langTarget);
                 
                 try {
                     const response = await openai.chat.completions.create({
                         model: "gpt-4o", 
                         messages: [
                             { 
                                 role: "user", 
                                 content: [
                                     // 🔥 AQUÍ ESTÁ LA CORRECCIÓN: PRIORIDAD TEXTO
                                     { type: "text", text: `Look for ANY text in this image. If found, TRANSLATE it to ${langTarget}. If there is NO text, briefly describe what you see in ${langTarget}. Output ONLY the result.` }, 
                                     { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } }
                                 ] 
                             }
                         ],
                         max_tokens: 150,
                     });
                     const aiText = response.choices[0].message.content;
                     
                     // Generar audio de la traducción
                     const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                     const buffer = Buffer.from(await mp3.arrayBuffer());
                     
                     ws.send(JSON.stringify({ type: 'full_response', user_text: "📸 [Imagen Analizada]", ai_text: aiText, audio_payload: buffer.toString('base64') }));
                 } catch (e) {
                     console.log("Error visión:", e);
                 }
             }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});