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

console.log(`🚀 SERVIDOR V51 (HÍBRIDO: MINI + MAX): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const ISO_CODES = {
    "Spanish": "es", "English": "en", "French": "fr", "Portuguese": "pt",
    "Chinese": "zh", "Japanese": "ja", "Russian": "ru", "Italian": "it", "German": "de"
};

// 🛡️ LISTA NEGRA (Anti-Youtuber + Anti-Basura)
const IGNORE_LIST = [
    "Subtitles by", "Amara.org", "Community", "Translated by", "MBC", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Silence", "Gracias por ver el video", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved"
];

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);
    ws.lastAiResponse = ""; 

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start_realtime_session') return;

            // ==========================================
            // 🎙️ LIVE (AUDIO) -> USA GPT-4o (CALIDAD MÁXIMA)
            // ==========================================
            if (data.type === 'audio_input') {
                const langNameA = data.langSource || "Spanish"; 
                const langNameB = data.langTarget || "English";
                const isoCode = ISO_CODES[langNameA] || "es"; 
                const style = data.style || "Neutral"; 
                
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                
                try {
                    fs.writeFileSync(tempIn, inputBuffer);

                    // 1. Oído (Whisper)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        language: isoCode, 
                        prompt: "Conversation, swear words allowed, verbatim.", 
                        temperature: 0 
                    });
                    
                    const userText = transcription.text.trim();
                    
                    // 2. Filtros
                    if (ws.lastAiResponse && userText.toLowerCase().includes(ws.lastAiResponse.toLowerCase().slice(0, -1))) {
                        console.log(`🔁 Eco detectado: "${userText}"`);
                        try { fs.unlinkSync(tempIn); } catch(e){} return; 
                    }
                    if (userText.length < 2 || IGNORE_LIST.some(x => userText.toLowerCase().includes(x.toLowerCase()))) {
                        console.log(`🔇 Basura ignorada: "${userText}"`);
                        try { fs.unlinkSync(tempIn); } catch(e){} return; 
                    }

                    console.log(`🗣️ Oído (${isoCode}): "${userText}"`);

                    // 3. Cerebro (GPT-4o para VOZ)
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a VERBATIM interpreter between ${langNameA} and ${langNameB}.
                                STYLE: ${style}.
                                RULES:
                                1. TRANSLATE EVERYTHING. No censorship.
                                2. DO NOT SUMMARIZE.
                                3. NEVER reply in the same language as input.
                                4. If input is noise, return "SILENCE".` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o", // 🔥 MÁXIMA CALIDAD PARA VOZ
                        max_tokens: 200
                    });
                    
                    const aiText = completion.choices[0].message.content;

                    if (aiText === "SILENCE" || aiText.toLowerCase().trim() === userText.toLowerCase().trim()) {
                        console.log("⚠️ Silencio/Bucle.");
                        try { fs.unlinkSync(tempIn); } catch(e){} return;
                    }

                    console.log(`🧠 Traducción (Live): "${aiText}"`);
                    ws.lastAiResponse = aiText; 

                    // 4. Voz (TTS)
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
            // 📝 CHAT (TEXTO) -> USA GPT-4o-MINI (ECONÓMICO)
            // ==========================================
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
                        model: "gpt-4o-mini" // 🔥 MINI PARA AHORRAR EN CHAT
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;
                    
                    // Voz (Opcional en chat, pero lo mantenemos)
                    const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                    const buffer = Buffer.from(await mp3.arrayBuffer());
                    
                    ws.send(JSON.stringify({ type: 'full_response', user_text: data.text, ai_text: aiText, audio_payload: buffer.toString('base64') }));
                    console.log(`💬 Chat (Mini): "${aiText}"`);
                } catch(e) {}
            }
            
            // 📸 CÁMARA (Vision) -> NECESITA GPT-4o (Mini no ve tan bien aún)
             else if (data.type === 'image_input') {
                 const langTarget = data.language || "Spanish";
                 try {
                     const response = await openai.chat.completions.create({
                         model: "gpt-4o", // 🔥 MANTENEMOS 4o PARA IMÁGENES
                         messages: [{ role: "user", content: [{ type: "text", text: `Describe briefly in ${langTarget}.` }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } }] }],
                         max_tokens: 150,
                     });
                     const aiText = response.choices[0].message.content;
                     ws.lastAiResponse = aiText;
                     const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                     const buffer = Buffer.from(await mp3.arrayBuffer());
                     ws.send(JSON.stringify({ type: 'full_response', user_text: "[Imagen]", ai_text: aiText, audio_payload: buffer.toString('base64') }));
                 } catch (e) {}
             }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});