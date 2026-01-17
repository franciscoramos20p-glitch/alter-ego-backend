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

console.log(`🚀 SERVIDOR V44 (ANTI-LOOP NUCLEAR): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ LISTA NEGRA AMPLIADA (Mata las alucinaciones comunes)
const IGNORE_LIST = [
    "Subtitles by", "Amara.org", "Community", "Translated by", "MBC", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Silence", "Ruido", "Copyright",
    "Claro, claro", "Clear, clear", // 🔥 MATAMOS EL BUCLE AQUÍ
    "Thank you. Thank you.", "Gracias. Gracias."
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
                const style = data.style || "Neutral"; 
                
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                
                try {
                    fs.writeFileSync(tempIn, inputBuffer);

                    // A. Whisper (Temperatura 0 = Cero imaginación)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        prompt: "Conversation. Do not repeat words.", 
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    
                    // 🔥 B. DETECTOR DE BUCLES (NUEVO)
                    // Si una palabra se repite 3 veces o más (ej: "Claro claro claro"), es basura.
                    const repetitionCheck = /((\b\w+\b)[\s\W]*)\1{2,}/i;
                    
                    if (userText.length < 2 || 
                        IGNORE_LIST.some(x => userText.toLowerCase().includes(x.toLowerCase())) ||
                        repetitionCheck.test(userText) // Detecta repetición
                    ) {
                        console.log(`🔇 Alucinación eliminada: "${userText}"`);
                        try { fs.unlinkSync(tempIn); } catch(e){}
                        return; 
                    }

                    console.log(`🗣️ Oído: "${userText}"`);

                    // C. Cerebro (MODO ESTRICTO)
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a professional interpreter between ${langA} and ${langB}.
                                STYLE: ${style}.
                                RULES:
                                1. Translate content ONLY.
                                2. DO NOT repeat the input language.
                                3. If the user repeats the same word 3+ times (e.g. "Claro, claro, claro"), return "SILENCE".` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o", 
                        max_tokens: 150,
                        temperature: 0.2
                    });
                    
                    const aiText = completion.choices[0].message.content;

                    // D. Anti-Bucle Final
                    if (aiText === "SILENCE" || aiText.toLowerCase().trim() === userText.toLowerCase().trim()) {
                        console.log("⚠️ Bucle detectado. Ignorando.");
                        try { fs.unlinkSync(tempIn); } catch(e){}
                        return;
                    }

                    console.log(`🧠 Traducción: "${aiText}"`);

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
            // 📝 CHAT TEXTO
            // ==========================================
            else if (data.type === 'text_input') {
                const langA = data.my_lang || "Spanish";
                const langB = data.language || "English";
                const style = data.style || "Neutral";
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [{ role: "system", content: `Translate from ${langA} to ${langB}. Style: ${style}.` }, { role: "user", content: data.text }],
                        model: "gpt-4o"
                    });
                    const aiText = completion.choices[0].message.content;
                    const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                    const buffer = Buffer.from(await mp3.arrayBuffer());
                    ws.send(JSON.stringify({ type: 'full_response', user_text: data.text, ai_text: aiText, audio_payload: buffer.toString('base64') }));
                } catch(e) {}
            }
            
            // ==========================================
            // 📸 CÁMARA
            // ==========================================
             else if (data.type === 'image_input') {
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