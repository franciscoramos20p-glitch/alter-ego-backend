import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import stringSimilarity from 'string-similarity';

dotenv.config();
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR MAESTRO V68 (OBEDIENTE + ANTI-ALUCINACIÓN): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🗑️ LISTA NEGRA (Solo basura confirmada)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada"
];

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);
    ws.lastAiResponse = ""; 

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start_realtime_session') return;

            // =================================================================
            // 🎙️ AUDIO INPUT
            // =================================================================
            if (data.type === 'audio_input') {
                const rawLangA = data.langSource || data.my_lang || "Español";
                const rawLangB = data.langTarget || data.target_lang_code || "Inglés";
                
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                
                try {
                    fs.writeFileSync(tempIn, inputBuffer);

                    // 1. WHISPER
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        // Prompt suave: ayuda a Whisper pero no lo bloquea
                        prompt: "Direct conversation. Transcribe exactly what is said.", 
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    
                    // 2. FILTRO DE LIMPIEZA (CAPA 1) - Caracteres repetidos locos
                    if (/(.)\1{4,}/.test(userText)) { 
                        try { fs.unlinkSync(tempIn); } catch(e){} return; 
                    }

                    // 3. FILTRO DE LISTA NEGRA (CAPA 2) - Relajado
                    // 🔥 CAMBIO CRÍTICO: Eliminé el filtro de longitud (userText.length < 2)
                    // Ahora permite palabras de 1 letra como "Y", "A", "I".
                    const lowerText = userText.toLowerCase();
                    if (userText.length === 0 || HALLUCINATION_TRIGGERS.some(trigger => lowerText.includes(trigger.toLowerCase()))) {
                        console.log(`🔇 Basura bloqueada: "${userText}"`); 
                        try { fs.unlinkSync(tempIn); } catch(e){} return; 
                    }

                    // 4. ANTI-ECO (CAPA 3)
                    if (ws.lastAiResponse) {
                        const similarity = stringSimilarity.compareTwoStrings(lowerText, ws.lastAiResponse.toLowerCase());
                        if (similarity > 0.5 || lowerText.includes(ws.lastAiResponse.toLowerCase().slice(0, 30))) {
                            console.log(`☢️ Eco ignorado.`);
                            try { fs.unlinkSync(tempIn); } catch(e){} return; 
                        }
                    }

                    console.log(`🗣️ Oído: "${userText}"`);

                    // 5. CEREBRO TRADUCTOR (GPT-4o) - MODO OBEDIENTE
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                // 🔥 PROMPT NUEVO: Prioriza traducir todo, incluso palabras cortas
                                content: `You are a PRECISE INTERPRETER for: ${rawLangA} <-> ${rawLangB}.
                                
                                RULES:
                                1. Translate EVERYTHING the user says, even short words (like "Yes", "No", "Hola").
                                2. IF input is ${rawLangA} -> Translate to ${rawLangB}.
                                3. IF input is ${rawLangB} -> Translate to ${rawLangA}.
                                4. NEVER repeat the input language. Switch languages.
                                5. Only return "SILENCE" if the input is strictly background noise (wind, static) or subtitle credits.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                        max_tokens: 200
                    });
                    
                    const aiText = completion.choices[0].message.content;

                    if (aiText === "SILENCE" || !aiText || aiText.trim().length === 0) {
                        try { fs.unlinkSync(tempIn); } catch(e){} return;
                    }

                    console.log(`🧠 Trad: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 6. VOZ (TTS)
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
            
            // ... (TEXTO E IMAGEN SIGUEN IGUAL) ...
            else if (data.type === 'text_input') {
                const langA = data.my_lang || "Español";
                const langB = data.language || "Inglés";
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: `Translate from ${langA} to ${langB} (or vice versa). Output ONLY translation.` }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini"
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;
                    const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                    const buffer = Buffer.from(await mp3.arrayBuffer());
                    ws.send(JSON.stringify({ type: 'full_response', user_text: data.text, ai_text: aiText, audio_payload: buffer.toString('base64') }));
                } catch(e) {}
            }
             else if (data.type === 'image_input') {
                 const langTarget = data.language || "English";
                 try {
                     const response = await openai.chat.completions.create({
                         model: "gpt-4o", 
                         messages: [{ role: "user", content: [{ type: "text", text: `Look for ANY text in this image. If found, TRANSLATE it to ${langTarget}. If there is NO text, briefly describe what you see in ${langTarget}. Output ONLY the result.` }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } }] }],
                         max_tokens: 150,
                     });
                     const aiText = response.choices[0].message.content;
                     const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                     const buffer = Buffer.from(await mp3.arrayBuffer());
                     ws.send(JSON.stringify({ type: 'full_response', user_text: "📸 [Imagen Analizada]", ai_text: aiText, audio_payload: buffer.toString('base64') }));
                 } catch (e) {}
             }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});