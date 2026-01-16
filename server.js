import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();

// Configuración FFMPEG
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
// Nota: apiKey se carga desde .env
console.log(`🚀 SERVIDOR V8.0 (WAV FIX): Puerto ${PORT} - LISTO`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// --- FUNCIÓN MÁGICA: Empaqueta audio crudo en WAV ---
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
    let openAiWs = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start_realtime_session') {
                console.log("🎙️ Iniciando Realtime...");
                
                openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'OpenAI-Beta': 'realtime=v1'
                    }
                });

                const lang1 = data.config?.lang1 || "es";
                const lang2 = data.config?.lang2 || "en";

                openAiWs.on('open', () => {
                    console.log("✅ OpenAI Conectado");
                    const sessionConfig = {
                        type: "session.update",
                        session: {
                            modalities: ["text", "audio"],
                            instructions: `Eres un traductor intérprete. Traduce lo que escuches entre ${lang1} y ${lang2}. Sé breve.`,
                            voice: "alloy",
                            input_audio_format: "pcm16",
                            output_audio_format: "pcm16",
                            turn_detection: { type: "server_vad", threshold: 0.5 }
                        }
                    };
                    openAiWs.send(JSON.stringify(sessionConfig));
                });

                openAiWs.on('message', (openaiMsg) => {
                    const response = JSON.parse(openaiMsg);
                    
                    // 1. SI OPENAI MANDA AUDIO
                    if (response.type === 'response.audio.delta' && response.delta) {
                        // Convertir PCM crudo a WAV con cabecera
                        const pcmBuffer = Buffer.from(response.delta, 'base64');
                        const header = createWavHeader(pcmBuffer.length, 24000);
                        const wavBuffer = Buffer.concat([header, pcmBuffer]);

                        ws.send(JSON.stringify({ 
                            type: 'audio_stream', 
                            audio: wavBuffer.toString('base64') 
                        }));
                    }
                    
                    if (response.type === 'input_audio_buffer.speech_started') {
                        ws.send(JSON.stringify({ type: 'vad_start' }));
                        openAiWs.send(JSON.stringify({ type: 'response.cancel' }));
                    }
                });
            }

            // 2. RECIBIR AUDIO DEL CLIENTE (M4A -> PCM)
            else if (data.type === 'audio_input' && openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `live_in_${Date.now()}_${Math.random()}.m4a`);
                const tempOut = path.join(tempDir, `live_out_${Date.now()}_${Math.random()}.raw`);

                try {
                    fs.writeFileSync(tempIn, inputBuffer);
                    
                    ffmpeg(tempIn)
                        .inputFormat('m4a')
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
                            console.error("FFMPEG Error:", err);
                            try { fs.unlinkSync(tempIn); } catch(e){}
                        });
                } catch (e) { console.error("FS Error:", e); }
            }

            else if (data.type === 'end_realtime_session') {
                if (openAiWs) openAiWs.close();
            }

        } catch (e) { console.error("Error General:", e.message); }
    });

    ws.on('close', () => { if (openAiWs) openAiWs.close(); });
});