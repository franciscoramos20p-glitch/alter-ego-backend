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

console.log(`🚀 SERVIDOR V41 (NOISE GATE PRO): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ LISTA DE BASURA (Bloquea subtítulos y alucinaciones conocidas)
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

            // 1. HANDSHAKE
            if (data.type === 'start_realtime_session') return;

            // ==========================================
            // 🎙️ 2. AUDIO INPUT (LIVE) - CON FILTRO DE RUIDO
            // ==========================================
            if (data.type === 'audio_input') {
                const langA = data.langSource || "Spanish";
                const langB = data.langTarget || "English";
                
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                
                try {
                    fs.writeFileSync(tempIn, inputBuffer);

                    // A. Whisper (Oído)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        prompt: "Conversation, no noise.", 
                        temperature: 0 
                    });
                    
                    const userText = transcription.text.trim();

                    // 🔥 B. EL SILENCIADOR (NOISE GATE)
                    // 1. Si es muy corto (< 4 letras), es ruido (ej: "Es", "Tú", "Ah").
                    // 2. Si está en la lista negra, es basura.
                    if (userText.length < 4 || IGNORE_LIST.some(x => userText.toLowerCase().includes(x.toLowerCase()))) {
                        console.log(`🔇 Ruido ignorado: "${userText}"`);
                        try { fs.unlinkSync(tempIn); } catch(e){}
                        return; // NO RESPONDEMOS NADA
                    }

                    console.log(`🗣️ Oído: "${userText}"`);

                    // C. Cerebro Bidireccional
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a translator between ${langA} and ${langB}.
                                RULES:
                                1. Translate input to the OTHER language.
                                2. CRITICAL: NEVER reply in the same language as input.
                                3. If input is nonsense, output "SILENCE".` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o", 
                        max_tokens: 150
                    });
                    
                    const aiText = completion.choices[0].message.content;

                    // D. Anti-Bucle (Si input == output, bloquear)
                    if (aiText.toLowerCase().trim() === userText.toLowerCase().trim() || aiText === "SILENCE") {
                        console.log("🔁 Bucle/Silencio detectado. Bloqueando.");
                        try { fs.unlinkSync(tempIn); } catch(e){}
                        return;
                    }

                    console.log(`🧠 Traducción: "${aiText}"`);

                    // E. Voz (TTS)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", voice: "alloy", input: aiText, response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    const audioBase64 = bufferTTS.toString('base64');

                    // F. Enviar (Live + Chat)
                    ws.send(JSON.stringify({ type: 'audio_stream', audio: audioBase64 }));
                    ws.send(JSON.stringify({ type: 'full_response', user_text: userText, ai_text: aiText, audio_payload: audioBase64 }));

                    try { fs.unlinkSync(tempIn); } catch(e){}

                } catch (error) { try { fs.unlinkSync(tempIn); } catch(e){} }
            }
            
            // ==========================================
            // 📝 3. CHAT TEXTO (NO BORRADO, AQUÍ SIGUE)
            // ==========================================
            else if (data.type === 'text_input') {
                console.log(`📝 Texto: "${data.text}"`);
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
            
            // ==========================================
            // 📸 4. CÁMARA (NO BORRADO, AQUÍ SIGUE)
            // ==========================================
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