import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V43 (STYLES & STRICT MODE): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ LISTA DE FILTRADO (Basura y Ruido)
const IGNORE_LIST = [
    "Subtitles by", "Amara.org", "Community", "Translated by", "MBC", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Silence", "Ruido"
];

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start_realtime_session') return;

            // ==========================================
            // 🎙️ AUDIO INPUT (LIVE)
            // ==========================================
            if (data.type === 'audio_input') {
                const langA = data.langSource || "Spanish";
                const langB = data.langTarget || "English";
                // 🔥 RECUPERAMOS EL ESTILO (Si la app no lo manda, usamos 'Neutral')
                const style = data.style || "Neutral"; 
                
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                
                try {
                    fs.writeFileSync(tempIn, inputBuffer);

                    // A. Whisper
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        prompt: "Conversation, clear speech.", 
                        temperature: 0 
                    });
                    
                    const userText = transcription.text.trim();
                    
                    // B. Filtro de Ruido (Mejorado para no borrar frases cortas válidas si son claras)
                    if (userText.length < 2 || IGNORE_LIST.some(x => userText.toLowerCase().includes(x.toLowerCase()))) {
                        console.log(`🔇 Ignorado: "${userText}"`);
                        try { fs.unlinkSync(tempIn); } catch(e){}
                        return; 
                    }

                    console.log(`🗣️ Oído: "${userText}"`);

                    // C. Cerebro (MODO ESTRICTO + ESTILOS)
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a professional interpreter between ${langA} and ${langB}.
                                
                                CURRENT STYLE: ${style} (Apply this tone to the translation).

                                RULES:
                                1. Translate the input to the OTHER language.
                                2. DO NOT CONVERSE. DO NOT ASK QUESTIONS. JUST TRANSLATE.
                                3. If input is ${langA}, output MUST be ${langB}.
                                4. If input is ${langB}, output MUST be ${langA}.
                                5. If the user says a name (like "Thomas"), keep the name but translate the rest.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o", 
                        max_tokens: 200,
                        temperature: 0.3 // Un poco de creatividad para los estilos
                    });
                    
                    const aiText = completion.choices[0].message.content;

                    // D. Anti-Bucle (Si repite lo mismo, forzamos reintento simple)
                    if (aiText.toLowerCase().trim() === userText.toLowerCase().trim()) {
                        console.log("⚠️ Bucle detectado. La IA no tradujo. Ignorando.");
                        try { fs.unlinkSync(tempIn); } catch(e){}
                        return;
                    }

                    console.log(`🧠 Traducción (${style}): "${aiText}"`);

                    // E. Voz
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
            
            // ==========================================
            // 📝 CHAT TEXTO (INTELIGENTE CON ESTILOS)
            // ==========================================
            else if (data.type === 'text_input') {
                console.log(`📝 Texto: "${data.text}"`);
                const langA = data.my_lang || "Spanish";
                const langB = data.language || "English";
                // 🔥 APLICAMOS ESTILO TAMBIÉN AQUÍ
                const style = data.style || "Neutral"; 

                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `Translate from ${langA} to ${langB}. 
                                Style: ${style}. 
                                Do not explain, just translate.` 
                            }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o"
                    });

                    const aiText = completion.choices[0].message.content;

                    const mp3 = await openai.audio.speech.create({ 
                        model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac'
                    });
                    const buffer = Buffer.from(await mp3.arrayBuffer());

                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: data.text, 
                        ai_text: aiText, 
                        audio_payload: buffer.toString('base64') 
                    }));

                } catch (e) { console.error("Text Error:", e.message); }
            }
            
            // 📸 CÁMARA (Sin cambios)
             else if (data.type === 'image_input') {
                 // ... (Código de imagen V37 se mantiene igual)
                 const langTarget = data.language || "Spanish";
                 try {
                     const response = await openai.chat.completions.create({
                         model: "gpt-4o",
                         messages: [
                             {
                                 role: "user",
                                 content: [
                                     { type: "text", text: `Describe briefly in ${langTarget}.` },
                                     { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } },
                                 ],
                             },
                         ],
                         max_tokens: 150,
                     });
                     const aiText = response.choices[0].message.content;
                     const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                     const buffer = Buffer.from(await mp3.arrayBuffer());
                     ws.send(JSON.stringify({ type: 'full_response', user_text: "[Imagen]", ai_text: aiText, audio_payload: buffer.toString('base64') }));
                 } catch (e) {}
             }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});