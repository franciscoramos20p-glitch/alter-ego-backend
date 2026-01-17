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

console.log(`🚀 SERVIDOR V48 (FIX BASURA TÉCNICA): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const ISO_CODES = {
    "Spanish": "es", "English": "en", "French": "fr", "Portuguese": "pt",
    "Chinese": "zh", "Japanese": "ja", "Russian": "ru", "Italian": "it", "German": "de"
};

// 🛡️ LISTA NEGRA CORREGIDA
// Quitamos "Ruido" para que puedas decir "Modo Ruidoso".
const IGNORE_LIST = [
    "Subtitles by", "Amara.org", "Community", "Translated by", "MBC", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Silence" // Dejamos Silence, pero quitamos Ruido
];

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start_realtime_session') return;

            // 🎙️ AUDIO INPUT
            if (data.type === 'audio_input') {
                const langNameA = data.langSource || "Spanish"; 
                const langNameB = data.langTarget || "English";
                const isoCode = ISO_CODES[langNameA] || "es"; 
                const style = data.style || "Neutral"; 
                
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                
                try {
                    fs.writeFileSync(tempIn, inputBuffer);

                    // Whisper RAW (Sin censura)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        language: isoCode, 
                        prompt: "Conversation, swear words allowed, explicit language, verbatim.", 
                        temperature: 0 
                    });
                    
                    const userText = transcription.text.trim();
                    
                    // Filtro corregido
                    if (userText.length < 2 || IGNORE_LIST.some(x => userText.toLowerCase().includes(x.toLowerCase()))) {
                        console.log(`🔇 Basura técnica ignorada: "${userText}"`);
                        try { fs.unlinkSync(tempIn); } catch(e){}
                        return; 
                    }

                    console.log(`🗣️ Oído (${isoCode}): "${userText}"`);

                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a VERBATIM interpreter between ${langNameA} and ${langNameB}.
                                STYLE: ${style}.
                                RULES:
                                1. TRANSLATE EVERYTHING (No censorship).
                                2. DO NOT SUMMARIZE.
                                3. NEVER reply in the same language.
                                4. If input is noise, return "SILENCE".` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o", 
                        max_tokens: 200
                    });
                    
                    const aiText = completion.choices[0].message.content;

                    if (aiText === "SILENCE" || aiText.toLowerCase().trim() === userText.toLowerCase().trim()) {
                        console.log("⚠️ Silencio/Bucle. Ignorando.");
                        try { fs.unlinkSync(tempIn); } catch(e){}
                        return;
                    }

                    console.log(`🧠 Traducción: "${aiText}"`);

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
            
            // 📝 CHAT Y 📸 CÁMARA (Sin cambios, todo sigue ahí)
            else if (data.type === 'text_input') {
                const langA = data.my_lang || "Spanish";
                const langB = data.language || "English";
                const style = data.style || "Neutral";
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: `Translate from ${langA} to ${langB}. Style: ${style}. Do not censor.` }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o"
                    });
                    const aiText = completion.choices[0].message.content;
                    const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                    const buffer = Buffer.from(await mp3.arrayBuffer());
                    ws.send(JSON.stringify({ type: 'full_response', user_text: data.text, ai_text: aiText, audio_payload: buffer.toString('base64') }));
                } catch(e) {}
            }
             else if (data.type === 'image_input') {
                 const langTarget = data.language || "Spanish";
                 try {
                     const response = await openai.chat.completions.create({
                         model: "gpt-4o",
                         messages: [{ role: "user", content: [{ type: "text", text: `Describe briefly in ${langTarget}.` }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } }] }],
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