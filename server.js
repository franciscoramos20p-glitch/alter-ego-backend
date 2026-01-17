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

console.log(`🚀 SERVIDOR V42 (FILTRO DE SENTIDO): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ LISTA NEGRA (Basura conocida)
const IGNORE_LIST = [
    "Subtitles by", "Amara.org", "Community", "Translated by", "MBC", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Mi carro tiene sed", "Silence", "Ruido"
];

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start_realtime_session') return;

            // 🎙️ AUDIO INPUT
            if (data.type === 'audio_input') {
                const langA = data.langSource || "Spanish";
                const langB = data.langTarget || "English";
                
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                
                try {
                    fs.writeFileSync(tempIn, inputBuffer);

                    // A. Whisper (Oído Frío)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        prompt: "Conversation, clear speech.", 
                        temperature: 0 
                    });
                    
                    const userText = transcription.text.trim();
                    
                    // 🔥 B. FILTRO DE CALIDAD (NUEVO)
                    // 1. Longitud mínima: Si son menos de 2 letras, es basura.
                    // 2. Lista negra.
                    // 3. Caracteres raros: Si empieza con símbolos raros, fuera.
                    if (userText.length < 2 || 
                        IGNORE_LIST.some(x => userText.toLowerCase().includes(x.toLowerCase())) ||
                        /^[\[\(\*]/.test(userText)) {
                        console.log(`🔇 Basura filtrada: "${userText}"`);
                        try { fs.unlinkSync(tempIn); } catch(e){}
                        return; 
                    }

                    console.log(`🗣️ Oído: "${userText}"`);

                    // C. Cerebro (MODO ESTRICTO)
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a strict interpreter between ${langA} and ${langB}.
                                RULES:
                                1. Translate ONLY valid sentences.
                                2. If the input is just noise, breathing, or a single nonsense syllable, return "SILENCE".
                                3. NEVER reply in the same language as input.
                                4. Output ONLY the translation.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o", 
                        max_tokens: 150
                    });
                    
                    const aiText = completion.choices[0].message.content;

                    // D. Anti-Bucle y Anti-Silencio
                    if (aiText === "SILENCE" || aiText.toLowerCase().trim() === userText.toLowerCase().trim()) {
                        console.log("🚫 Traducción inválida o repetida. Bloqueando.");
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
            
            // 📝 CHAT Y 📸 CÁMARA (SE MANTIENEN IGUAL)
            else if (data.type === 'text_input') {
                const langA = data.my_lang || "Spanish";
                const langB = data.language || "English";
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [{ role: "system", content: `Translate between ${langA} and ${langB}.` }, { role: "user", content: data.text }],
                        model: "gpt-4o"
                    });
                    const aiText = completion.choices[0].message.content;
                    const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                    const buffer = Buffer.from(await mp3.arrayBuffer());
                    ws.send(JSON.stringify({ type: 'full_response', user_text: data.text, ai_text: aiText, audio_payload: buffer.toString('base64') }));
                } catch(e) {}
            }
             else if (data.type === 'image_input') {
                 console.log(`📸 Imagen recibida`);
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