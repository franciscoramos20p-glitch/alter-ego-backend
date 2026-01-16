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

console.log(`🚀 SERVIDOR V37 (GOD MODE - ALL FEATURES): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🗑️ FILTRO DE BASURA (EQUILIBRADO)
const IGNORE_LIST = [
    "Subtitles by", "Amara.org", "Community", "Translated by", "MBC", 
    "watching", "Please subscribe", "sous-titres", "captioned"
];

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // ==========================================
            // 1. HANDSHAKE (INICIO DE LIVE)
            // ==========================================
            if (data.type === 'start_realtime_session') {
                // Solo confirmamos conexión
                return;
            }

            // ==========================================
            // 🎙️ 2. AUDIO INPUT (LIVE & CHAT DE VOZ)
            // ==========================================
            if (data.type === 'audio_input') {
                const langA = data.langSource || "Spanish";
                const langB = data.langTarget || "English";
                
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                
                try {
                    fs.writeFileSync(tempIn, inputBuffer);

                    // A. Whisper (El mejor oído)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        prompt: "Conversation." // Contexto para mejorar precisión
                    });
                    
                    const userText = transcription.text.trim();
                    
                    // B. Filtro Anti-Basura
                    if (userText.length < 2 || IGNORE_LIST.some(x => userText.includes(x))) {
                        try { fs.unlinkSync(tempIn); } catch(e){}
                        return; // Ignoramos silencio/ruido
                    }

                    console.log(`🗣️ Oído: "${userText}"`);

                    // C. Cerebro Bidireccional (GPT-4o) + ANTI-ECO
                    // La regla "NEVER reply in the SAME language" evita el bucle infinito del loro.
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are an interpreter between ${langA} and ${langB}.
                                CRITICAL RULES:
                                1. Detect if input is ${langA} or ${langB}.
                                2. Translate IMMEDIATELY to the OTHER language.
                                3. NEVER reply in the same language as the input.
                                4. Output ONLY the translation.` 
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

                    // E. RESPONDER A TODOS (Live y Chat)
                    // Live:
                    ws.send(JSON.stringify({ type: 'audio_stream', audio: audioBase64 }));
                    
                    // Chat Clásico (Texto + Audio):
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio_payload: audioBase64 
                    }));

                    try { fs.unlinkSync(tempIn); } catch(e){}

                } catch (error) { 
                    console.error("Audio Error:", error.message);
                    try { fs.unlinkSync(tempIn); } catch(e){} 
                }
            }

            // ==========================================
            // 📝 3. TEXT INPUT (CHAT CLÁSICO)
            // ==========================================
            else if (data.type === 'text_input') {
                console.log(`📝 Texto recibido: "${data.text}"`);
                
                const langA = data.my_lang || "Spanish";
                const langB = data.language || "English";

                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a translator between ${langA} and ${langB}. Translate directly.` 
                            },
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o"
                    });

                    const aiText = completion.choices[0].message.content;

                    // Audio del texto
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

            // ==========================================
            // 📸 4. IMAGE INPUT (CÁMARA / VISIÓN)
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
                                    { type: "text", text: `What is in this image? Describe it briefly in ${langTarget}.` },
                                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } },
                                ],
                            },
                        ],
                        max_tokens: 150,
                    });

                    const aiText = response.choices[0].message.content;
                    console.log(`👁️ Visión: "${aiText}"`);

                    // Generar Audio de la descripción
                    const mp3 = await openai.audio.speech.create({ 
                        model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac'
                    });
                    const buffer = Buffer.from(await mp3.arrayBuffer());

                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: "[Imagen]", 
                        ai_text: aiText, 
                        audio_payload: buffer.toString('base64') 
                    }));

                } catch (e) { console.error("Vision Error:", e.message); }
            }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});