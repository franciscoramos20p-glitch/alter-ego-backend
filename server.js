import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();

// ✅ 1. CONFIGURACIÓN FFMPEG (CRÍTICO PARA QUE FUNCIONE)
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V10 (MASTER HÍBRIDO): Puerto ${PORT} - CHAT Y LIVE ACTIVOS`);

// Directorio temporal (Limpio y seguro)
const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ FILTRO ANTI-ALUCINACIONES (Para el Chat Clásico)
const HALLUCINATIONS = [
    "Subtitles by", "Amara.org", "Community", "music playing", 
    "Unresearched", "Thank you", "Suscríbete", "Copyright", 
    "Translated by", "MBC", "provided by", "watching",
    "Please subscribe", "Me gusta", "blue skies", "sous-titres",
    "Silence", "Ruido", "Noise", "www.", ".com", "Sucedió",
    "subtítulos", "captioned", "Audio", "Transcribe", 
    "música", "aplausos", "risa", "locutor", "voz en off"
];

// 🗺️ IDIOMAS (Para Chat Clásico)
const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it',
    'Portugués': 'pt', 'Chino': 'zh', 'Japonés': 'ja', 'Coreano': 'ko', 'Ruso': 'ru'
};

// 🔧 FUNCIÓN MÁGICA: Empaqueta el audio crudo en WAV para que el celular lo entienda
function createWavHeader(dataLength, sampleRate = 24000) {
    const buffer = Buffer.alloc(44);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); 
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // 1 Canal
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32); 
    buffer.writeUInt16LE(16, 34); 
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    return buffer;
}

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);
    let openAiWs = null; // Socket para Modo Live

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // ===============================================
            // A. MODO ULTRA LIVE (REALTIME API)
            // ===============================================
            if (data.type === 'start_realtime_session') {
                console.log("🎙️ Iniciando Live...");
                
                openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'OpenAI-Beta': 'realtime=v1'
                    }
                });

                const lang1 = data.config?.lang1 || "es";
                const lang2 = data.config?.lang2 || "en";

                openAiWs.on('open', () => {
                    console.log("✅ OpenAI Live Listo");
                    // Instrucciones para que OpenAI detecte mejor la voz
                    const sessionConfig = {
                        type: "session.update",
                        session: {
                            modalities: ["text", "audio"],
                            instructions: `Eres un intérprete experto. Traduce fluido entre ${lang1} y ${lang2}. Ignora ruido.`,
                            voice: "alloy",
                            input_audio_format: "pcm16",
                            output_audio_format: "pcm16",
                            turn_detection: { 
                                type: "server_vad", 
                                threshold: 0.4, // Más sensible para detectar voz
                                prefix_padding_ms: 500, // Escuchar un poco antes
                                silence_duration_ms: 600 // Responder rápido
                            }
                        }
                    };
                    openAiWs.send(JSON.stringify(sessionConfig));
                });

                openAiWs.on('message', (openaiMsg) => {
                    const response = JSON.parse(openaiMsg);
                    
                    // 🔊 AQUÍ ESTÁ EL FIX DEL AUDIO: Envolvemos en WAV
                    if (response.type === 'response.audio.delta' && response.delta) {
                        const pcmBuffer = Buffer.from(response.delta, 'base64');
                        const header = createWavHeader(pcmBuffer.length, 24000);
                        const wavBuffer = Buffer.concat([header, pcmBuffer]); // Audio listo para reproducir

                        ws.send(JSON.stringify({ 
                            type: 'audio_stream', 
                            audio: wavBuffer.toString('base64') 
                        }));
                    }
                    
                    if (response.type === 'input_audio_buffer.speech_started') {
                        ws.send(JSON.stringify({ type: 'vad_start' })); // Avisar que IA escucha
                        openAiWs.send(JSON.stringify({ type: 'response.cancel' })); // Calla a la IA si interrumpes
                    }
                });
                
                openAiWs.on('error', (e) => console.error("Error OpenAI WS:", e.message));
            }

            // 📥 RECIBIR AUDIO LIVE DEL CLIENTE (Convierte M4A -> PCM)
            else if (data.type === 'audio_input' && openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `live_in_${Date.now()}_${Math.random()}.m4a`);
                const tempOut = path.join(tempDir, `live_out_${Date.now()}_${Math.random()}.raw`);

                try {
                    fs.writeFileSync(tempIn, inputBuffer);
                    
                    // Usamos FFMPEG para estandarizar el audio del celular
                    ffmpeg(tempIn)
                        // .inputFormat('m4a') <--- LO QUITAMOS para que detecte automático (Más seguro)
                        .audioFrequency(24000)
                        .audioChannels(1)
                        .audioCodec('pcm_s16le')
                        .format('s16le')
                        .save(tempOut)
                        .on('end', () => {
                            if (fs.existsSync(tempOut)) {
                                const pcmData = fs.readFileSync(tempOut);
                                openAiWs.send(JSON.stringify({
                                    type: "input_audio_buffer.append",
                                    audio: pcmData.toString('base64')
                                }));
                                try { fs.unlinkSync(tempIn); fs.unlinkSync(tempOut); } catch(e){}
                            }
                        })
                        .on('error', (err) => {
                            console.error("Error Convirtiendo Audio:", err);
                            try { fs.unlinkSync(tempIn); } catch(e){}
                        });
                } catch (e) { console.error("Error Archivos:", e); }
            }

            else if (data.type === 'end_realtime_session') {
                if (openAiWs) openAiWs.close();
                console.log("🛑 Live Terminado");
            }

            // =====================================
            // B. MODO CLÁSICO (CHAT / ARCHIVOS) - ¡RESTITUIDO PARA TESTERS!
            // =====================================
            else if (['audio_input', 'text_input'].includes(data.type) && !openAiWs) {
                // Si NO hay sesión Live activa, usamos el chat clásico
                await handleClassicRequest(ws, data);
            }

        } catch (e) { console.error("Error General WS:", e.message); }
    });

    ws.on('close', () => { if (openAiWs) openAiWs.close(); });
});

// --- LÓGICA DEL CHAT CLÁSICO ---
async function handleClassicRequest(ws, data) {
    try {
        let userText = "";
        
        // 1. Audio (Whisper)
        if (data.type === 'audio_input') {
            const inputPath = path.join(tempDir, `classic_${Date.now()}.m4a`);
            fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
            
            const langCode = data.my_lang ? (ISO_LANGS[data.my_lang.split(' ')[0]] || undefined) : undefined;
            const transcription = await openai.audio.transcriptions.create({ 
                file: fs.createReadStream(inputPath), 
                model: "whisper-1", 
                language: langCode 
            });
            try { fs.unlinkSync(inputPath); } catch(e){}
            userText = transcription.text;
        } 
        // 2. Texto
        else if (data.type === 'text_input') {
            userText = data.text;
        }

        const cleanText = userText ? userText.trim() : "";
        if (cleanText.length < 2 || HALLUCINATIONS.some(h => cleanText.toLowerCase().includes(h.toLowerCase()))) return;

        // 3. GPT-4o
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: `Eres Traductor Pro. Traduce: ${cleanText}` }, // Simplificado
                { role: "user", content: cleanText }
            ],
            model: "gpt-4o", 
            max_tokens: 300
        });
        
        const aiText = completion.choices[0].message.content;

        // 4. TTS
        const mp3 = await openai.audio.speech.create({ 
            model: "tts-1", 
            voice: data.voice || "alloy", 
            input: aiText, 
            speed: 1.1 
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        
        ws.send(JSON.stringify({ 
            type: 'full_response', 
            user_text: cleanText, 
            ai_text: aiText, 
            audio_payload: buffer.toString('base64') 
        }));

    } catch (e) { console.error("Error Chat Clásico:", e); }
}