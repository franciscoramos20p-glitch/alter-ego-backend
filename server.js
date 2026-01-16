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

console.log(`🚀 SERVIDOR V35 (FULL HYBRID): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ FILTRO CORRECTO (V34) - Permisivo pero limpio
const IGNORE_LIST = [
    "Subtitles by", "Amara.org", "Community", 
    "Unresearched", "Thank you", "Suscríbete", "Copyright", 
    "Translated by", "MBC", "watching", "Please subscribe", 
    "sous-titres", "captioned"
];

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // ==========================
            // 🟢 1. HANDSHAKE (LIVE)
            // ==========================
            if (data.type === 'start_realtime_session') {
                // Solo confirmamos conexión, no iniciamos nada raro
                return; 
            }

            // ==========================
            // 🎙️ 2. AUDIO INPUT (LIVE & CHAT DE VOZ)
            // ==========================
            if (data.type === 'audio_input') {
                const langA = data.langSource || "Spanish";
                const langB = data.langTarget || "English";
                
                // console.log(`📨 Audio (${data.payload.length}b) | ${langA} <-> ${langB}`);

                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                
                try {
                    fs.writeFileSync(tempIn, inputBuffer);

                    // A. Whisper (Detecta todo)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        prompt: "Conversation, natural speech." 
                    });
                    
                    const userText = transcription.text.trim();
                    
                    // B. Filtro Anti-Basura
                    if (userText.length < 2 || IGNORE_LIST.some(x => userText.toLowerCase().includes(x.toLowerCase()))) {
                        try { fs.unlinkSync(tempIn); } catch(e){}
                        return; 
                    }

                    console.log(`🗣️ Oído: "${userText}"`);

                    // C. Cerebro Bidireccional (GPT-4o)
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a professional interpreter between ${langA} and ${langB}.
                                RULES:
                                1. Detect if input is ${langA} or ${langB}.
                                2. Translate IMMEDIATELY to the OTHER language.
                                3. Output ONLY the translation. No notes.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o", 
                        max_tokens: 150
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    console.log(`🧠 Traducción: "${aiText}"`);

                    // D. Voz (TTS)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: "alloy", 
                        input: aiText,
                        response_format: "aac"
                    });
                    
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    const audioBase64 = bufferTTS.toString('base64');

                    // E. RESPUESTA HÍBRIDA (Sirve para Live y para Chat)
                    
                    // 1. Para Live (Stream rápido)
                    ws.send(JSON.stringify({ 
                        type: 'audio_stream', 
                        audio: audioBase64
                    }));

                    // 2. Para Chat Clásico (Texto + Audio)
                    // Esto hace que si usas la pantalla de Chat, aparezca el texto también
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio_payload: audioBase64 
                    }));

                    try { fs.unlinkSync(tempIn); } catch(e){}

                } catch (error) {
                    console.error("❌ Error Audio:", error.message);
                    try { fs.unlinkSync(tempIn); } catch(e){}
                }
            }

            // ==========================
            // 📝 3. TEXT INPUT (CHAT CLÁSICO) - ¡RESTAURADO!
            // ==========================
            else if (data.type === 'text_input') {
                console.log(`📝 Texto recibido: "${data.text}"`);
                
                // Usamos los mismos idiomas o defaults
                const langA = data.my_lang || "Spanish";
                const langB = data.language || "English";

                try {
                    // Traducción Bidireccional de Texto
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a translator between ${langA} and ${langB}.
                                Translate the user text to the other language effectively.
                                Return ONLY the translation.` 
                            }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o"
                    });

                    const aiText = completion.choices[0].message.content;

                    // Generar Audio también para el chat
                    const mp3 = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: "alloy", 
                        input: aiText, 
                        response_format: 'aac'
                    });
                    const buffer = Buffer.from(await mp3.arrayBuffer());

                    // Respuesta completa para la UI de Chat
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: data.text, 
                        ai_text: aiText, 
                        audio_payload: buffer.toString('base64') 
                    }));

                } catch (e) {
                    console.error("❌ Error Texto:", e.message);
                }
            }

        } catch (e) { console.error("Error WS:", e.message); }
    });
});