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

console.log(`🚀 SERVIDOR V31 (SMART FLOW): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// Filtramos ruidos comunes
const IGNORE_LIST = ["Subtitles by", "Amara.org", "Silence", "Ruido", "music playing"];

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start_realtime_session') {
                console.log("🎙️ Sesión Iniciada");
                ws.send(JSON.stringify({ type: 'debug', msg: 'Sistema Listo 🟢' }));
                return;
            }

            if (data.type === 'audio_input') {
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                
                try {
                    fs.writeFileSync(tempIn, inputBuffer);

                    // 1. TRANSCRIPCIÓN (WHISPER)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        language: data.langSource || "es", // Ayuda a enfocar
                        prompt: "Conversation, no subtitles." // Pista para evitar alucinaciones
                    });
                    
                    const userText = transcription.text.trim();
                    
                    // Si es muy corto o basura, ignoramos
                    if (userText.length < 2 || IGNORE_LIST.some(x => userText.includes(x))) {
                        try { fs.unlinkSync(tempIn); } catch(e){}
                        return; 
                    }

                    console.log(`🗣️ Oído: "${userText}"`);

                    // 2. TRADUCCIÓN (GPT-4o)
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a professional interpreter. 
                                Translate the input text naturally to the target language.
                                If the text is just noise or cutoff words, ignore it.
                                Do NOT respond to the user, just TRANSLATE.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o", 
                        max_tokens: 60
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    console.log(`🧠 Traducido: "${aiText}"`);

                    // 3. GENERAR AUDIO (TTS)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: "alloy", 
                        input: aiText,
                        response_format: "aac" // AAC es más rápido para enviar
                    });
                    
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());

                    // 4. ENVIAR
                    ws.send(JSON.stringify({ 
                        type: 'audio_stream', 
                        audio: bufferTTS.toString('base64') 
                    }));

                    try { fs.unlinkSync(tempIn); } catch(e){}

                } catch (error) {
                    console.error("❌ Error:", error.message);
                    try { fs.unlinkSync(tempIn); } catch(e){}
                }
            }

        } catch (e) { console.error("Error WS:", e.message); }
    });
});