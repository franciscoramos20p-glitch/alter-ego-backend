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

console.log(`🚀 SERVIDOR V39 (FORTRESS - TODO INCLUIDO): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ LISTA NEGRA SUPREMA (Protección contra locura)
const IGNORE_LIST = [
    "Subtitles by", "Amara.org", "Community", "Translated by", "MBC", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", // Alucinación detectada
    "You only see what you can see",
    "Mi carro tiene sed",
    "Silence", "Ruido"
];

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // 1. HANDSHAKE (LIVE)
            if (data.type === 'start_realtime_session') {
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

                    // A. Whisper (MODO FRÍO: Temperature 0 para evitar inventos)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        prompt: "Conversation.", 
                        temperature: 0 
                    });
                    
                    const userText = transcription.text.trim();
                    
                    // B. Filtro Anti-Basura
                    if (userText.length < 2 || IGNORE_LIST.some(x => userText.toLowerCase().includes(x.toLowerCase()))) {
                        console.log(`🗑️ Alucinación bloqueada: "${userText}"`);
                        try { fs.unlinkSync(tempIn); } catch(e){}
                        return; 
                    }

                    console.log(`🗣️ Oído: "${userText}"`);

                    // C. Cerebro Bidireccional (GPT-4o) + ANTI-ECO
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are an interpreter between ${langA} and ${langB}.
                                RULES:
                                1. Detect if input is ${langA} or ${langB}.
                                2. Translate IMMEDIATELY to the OTHER language.
                                3. CRITICAL: NEVER reply in the same language as the input.
                                4. Output ONLY the translation.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o", 
                        max_tokens: 150
                    });
                    
                    const aiText = completion.choices[0].message.content;

                    // 🔥 EL CORTAFUEGOS (ANTI-BUCLE)
                    // Si la traducción es IGUAL a lo que escuchó, es un eco del celular. BLOQUEAR.
                    if (aiText.toLowerCase().trim() === userText.toLowerCase().trim()) {
                        console.log("🔁 Bucle detectado (Input = Output). Bloqueando audio.");
                        try { fs.unlinkSync(tempIn); } catch(e){}
                        return;
                    }

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

                    // E. RESPUESTA DOBLE (Para Live y para Chat)
                    
                    // 1. Stream para Live
                    ws.send(JSON.stringify({ type: 'audio_stream', audio: audioBase64 }));
                    
                    // 2. Full Response para Chat Clásico (Texto + Audio)
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
                                    { type: "text", text: `Describe what is in this image briefly in ${langTarget}.` },
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
                        user_text: "[Imagen Analizada]", 
                        ai_text: aiText, 
                        audio_payload: buffer.toString('base64') 
                    }));

                } catch (e) { console.error("Vision Error:", e.message); }
            }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});