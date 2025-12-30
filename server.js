import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🧠 CEREBRO ACTUALIZADO (MODO LECTOR ACTIVADO): Listo en puerto ${PORT}`);

const tempDir = path.resolve('temp_audio');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🗺️ MAPA DE IDIOMAS
const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Japonés': 'ja', 
    'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it', 
    'Portugués': 'pt', 'Chino': 'zh'
};

function getIsoCode(fullLang) {
    const cleanName = fullLang.split(' ')[0]; 
    return ISO_LANGS[cleanName] || 'en';
}

wss.on('connection', (ws) => {
    console.log('📱 App conectada');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            // === DATOS DE LA APP ===
            const myLang = data.my_lang || "Español";
            const targetLang = data.language || "Inglés";
            const chosenTone = data.tone || "Neutral";
            const chosenVoice = data.voice || "alloy";
            const mode = data.mode || "interpreter"; 

            // === 🎤 AUDIO ===
            if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `input_${Date.now()}.m4a`);
                const buffer = Buffer.from(data.payload, 'base64');
                fs.writeFileSync(inputPath, buffer);

                // 1. Whisper con Prompt Guía
                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    prompt: `The audio is a conversation strictly in ${myLang} or ${targetLang}. Ignora ruidos de fondo o silencio.`,
                    temperature: 0 
                });

                const userText = transcription.text;
                fs.unlinkSync(inputPath);

                // Filtro de ruido
                if (!userText || userText.trim().length < 2) return; 

                console.log(`👂 (${mode}) Escuché: "${userText}"`);

                // 2. LÓGICA DE TRADUCCIÓN
                let systemPrompt = "";

                if (mode === 'interpreter') {
                    systemPrompt = `
                        Eres un intérprete experto.
                        CONTEXTO: Usuario habla ${myLang}, Interlocutor habla ${targetLang}.
                        TU TAREA:
                        1. Si el texto "${userText}" está en ${myLang} -> Tradúcelo al ${targetLang}.
                        2. Si está en ${targetLang} -> Tradúcelo al ${myLang}.
                        Mantén el tono: ${chosenTone}. Solo la traducción.
                    `;
                } else {
                    systemPrompt = `
                        Eres un asistente de traducción personal.
                        Tu dueño solo habla: ${myLang}.
                        TU TAREA: Escucha "${userText}". Si NO está en ${myLang}, tradúcelo al ${myLang}.
                        Si YA está en ${myLang}, repítelo o mejóralo.
                        Tono: ${chosenTone}. Solo la traducción.
                    `;
                }

                const completion = await openai.chat.completions.create({
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userText }
                    ],
                    model: "gpt-4o",
                    temperature: 0.3,
                });

                const aiText = completion.choices[0].message.content;
                sendResponse(ws, userText, aiText, chosenTone, chosenVoice);
            }

            // === 👁️ VISIÓN (ACTUALIZADO: LECTOR DE TEXTO) ===
            if (data.type === 'image_input') {
                console.log("📸 Analizando imagen...");
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ 
                            { type: "text", text: `
                                ACTÚA COMO UN TRADUCTOR VISUAL. 
                                Tu prioridad absoluta es LEER EL TEXTO en la imagen.
                                
                                INSTRUCCIONES:
                                1. Si la imagen contiene texto (documentos, pantallas, carteles, menús): EXTRAE ese texto y TRADÚCELO directamente al ${myLang}.
                                2. NO describas la imagen (Prohibido decir "La imagen muestra..." o "Veo una captura...").
                                3. Solo si la imagen NO tiene texto, entonces describe brevemente lo que ves.
                                
                                Tono: ${chosenTone}.
                            `}, 
                            // Usamos detail: "high" para que lea letras pequeñas
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}`, detail: "high" } } 
                        ]}
                    ],
                    max_tokens: 300, 
                });
                const aiText = response.choices[0].message.content;
                sendResponse(ws, "📸 (Imagen analizada)", aiText, chosenTone, chosenVoice);
            }

        } catch (error) { console.error("Error:", error.message); }
    });
});

async function sendResponse(ws, userText, aiText, tone, voice = 'alloy') {
    // Si el texto es muy largo (ej. traducción de documento), hablamos un poco más rápido
    const speed = aiText.length > 100 ? 1.2 : 1.1;

    const mp3 = await openai.audio.speech.create({ 
        model: "tts-1", 
        voice: voice, 
        input: aiText, 
        speed: speed 
    });
    
    const audioBuffer = Buffer.from(await mp3.arrayBuffer());
    
    ws.send(JSON.stringify({ 
        type: 'full_response', 
        user_text: userText, 
        ai_text: aiText, 
        tone: tone, 
        audio_payload: audioBuffer.toString('base64') 
    }));
}