import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();

// ✅ FFMPEG
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V30 (NÚCLEO ESTABLE): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ FILTRO DE BASURA
const HALLUCINATIONS = [
    "Subtitles by", "Amara.org", "Community", "music playing", 
    "Unresearched", "Thank you", "Suscríbete", "Copyright", 
    "Translated by", "MBC", "watching"
];

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // 1. INICIO DE SESIÓN (Aceptamos la conexión y decimos "Listo")
            if (data.type === 'start_realtime_session') {
                console.log("🎙️ Iniciando Live V30 (Modo Estable)...");
                ws.send(JSON.stringify({ type: 'debug', msg: 'Sistema Estable 🟢' }));
                // No abrimos socket a OpenAI Realtime, usaremos HTTP rápido.
                return;
            }

            // 2. RECIBIR AUDIO (Procesamiento Robusto)
            if (data.type === 'audio_input') {
                console.log(`📨 AUDIO RECIBIDO: ${data.payload.length} bytes`);

                // A. Guardar Audio Entrada
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                fs.writeFileSync(tempIn, inputBuffer);

                try {
                    // B. TRANSCRIPCIÓN (WHISPER) - Infalible
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        language: "es" // Opcional: Ayuda a enfocar
                    });
                    
                    const userText = transcription.text.trim();
                    console.log(`🗣️ Oído: "${userText}"`);

                    // Filtro de Silencio/Basura
                    if (userText.length < 2 || HALLUCINATIONS.some(h => userText.includes(h))) {
                        console.log("⚠️ Audio ignorado (Silencio/Ruido).");
                        try { fs.unlinkSync(tempIn); } catch(e){}
                        return;
                    }

                    // C. TRADUCCIÓN (GPT-4o)
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: "You are a translator. Translate the text to English directly. No explanations." }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o", 
                        max_tokens: 100
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    console.log(`🧠 Traducción: "${aiText}"`);

                    // D. GENERAR AUDIO (TTS)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: "alloy", 
                        input: aiText,
                        response_format: "wav" // Pedimos WAV directo
                    });
                    
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());

                    // E. ENVIAR AL CELULAR
                    console.log(`🔊 ENVIANDO AUDIO (${bufferTTS.length} bytes)`);
                    ws.send(JSON.stringify({ 
                        type: 'audio_stream', 
                        audio: bufferTTS.toString('base64') 
                    }));

                    // Limpieza
                    try { fs.unlinkSync(tempIn); } catch(e){}

                } catch (error) {
                    console.error("❌ Error Procesamiento:", error.message);
                    ws.send(JSON.stringify({ type: 'debug', msg: 'Error: ' + error.message }));
                    try { fs.unlinkSync(tempIn); } catch(e){}
                }
            }

        } catch (e) { console.error("Error General:", e.message); }
    });
});