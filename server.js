import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 CEREBRO v3.9.7 (Anti-Fantasmas + GPT-mini): Listo en puerto ${PORT}`);

const tempDir = path.resolve('temp_audio');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

//# 🗺️ MAPA DE IDIOMAS GIGANTE (Soporte para los 50 idiomas de la v3.9)
const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Japonés': 'ja', 'Coreano': 'ko',
    'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it', 'Portugués': 'pt', 
    'Chino': 'zh', 'Ruso': 'ru', 'Árabe': 'ar', 'Hindi': 'hi',
    'Holandés': 'nl', 'Turco': 'tr', 'Polaco': 'pl', 'Sueco': 'sv',
    'Griego': 'el', 'Hebreo': 'he', 'Tailandés': 'th', 'Vietnamita': 'vi',
    'Indonesio': 'id', 'Checo': 'cs', 'Danés': 'da', 'Finlandés': 'fi',
    'Húngaro': 'hu', 'Noruego': 'no', 'Rumano': 'ro', 'Ucraniano': 'uk',
    'Tagalo': 'tl', 'Malayo': 'ms', 'Búlgaro': 'bg', 'Croata': 'hr',
    'Eslovaco': 'sk', 'Estonio': 'et', 'Catalán': 'ca', 'Serbio': 'sr',
    'Lituano': 'lt', 'Esloveno': 'sl', 'Letón': 'lv', 'Persa': 'fa',
    'Urdu': 'ur', 'Bengalí': 'bn'
};
wss.on('connection', (ws) => {
    console.log('⚡ Cliente conectado');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            const myLang = data.my_lang || "Español";
            const targetLang = data.language || "Inglés";
            const chosenTone = data.tone || "Neutral"; 
            const chosenVoice = data.voice || "alloy";
            const mode = data.mode || "interpreter"; 

            // === ⌨️ MODO TEXTO (BARATO Y RÁPIDO) ===
            if (data.type === 'text_input') {
                console.log(`📝 Texto (Mini): "${data.text}"`);
                // AQUÍ USAMOS GPT-4o-mini (Más barato)
                await processGPTAndRespond(ws, data.text, myLang, targetLang, chosenTone, chosenVoice, mode, "gpt-4o-mini");
            }

            // === 🎤 MODO INTERPRETE (INTELIGENTE) ===
            if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `input_${Date.now()}.m4a`);
                fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));

                // Whisper detecta el idioma para evitar alucinaciones
                const langCode = ISO_LANGS[myLang.split(' ')[0]] || undefined;

                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    prompt: `Conversation between ${myLang} and ${targetLang}.`, 
                    temperature: 0, 
                    language: langCode 
                });

                const userText = transcription.text;
                fs.unlinkSync(inputPath); 

                // Filtro básico de silencio
                if (!userText || userText.trim().length < 2) return;
                
                // Filtro de Alucinaciones comunes
                const BAD_WORDS = ["Subtitle", "Subtítulos", "Amara.org", "MBC", "Copyright", "Inglés", "Español", "Spanish", "English"];
                if (BAD_WORDS.includes(userText.trim())) return;

                console.log(`👂 Audio (GPT-4o): "${userText}"`);

                // AQUÍ USAMOS GPT-4o (El potente)
                await processGPTAndRespond(ws, userText, myLang, targetLang, chosenTone, chosenVoice, mode, "gpt-4o");
            }

            // === 👁️ VISIÓN ===
            if (data.type === 'image_input') {
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ 
                            { type: "text", text: `Traduce texto a ${myLang}. Tono: ${chosenTone}.`}, 
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}`, detail: "auto" } }
                        ]}
                    ],
                    max_tokens: 300, 
                });
                sendResponse(ws, "📸 Imagen", response.choices[0].message.content, chosenTone, chosenVoice);
            }

        } catch (error) { console.error("Error:", error.message); }
    });
});

async function processGPTAndRespond(ws, userText, myLang, targetLang, tone, voice, mode, modelName) {
    let systemPrompt = "";
    
    // PROMPT BLINDADO ANTI-FANTASMAS
    if (mode === 'interpreter') {
        systemPrompt = `You are a professional interpreter. 
        Context: ${tone}.
        Tasks:
        1. Translate strictly.
        2. If input is ${myLang}, translate to ${targetLang}.
        3. If input is ${targetLang}, translate to ${myLang}.
        4. CRITICAL: Do NOT repeat the name of the language (e.g. do not say 'Spanish' or 'Inglés'). Just translate the content.
        5. If the input is nonsense or silence, output NOTHING.`;
    } else {
        systemPrompt = `Translate to ${myLang}. Tono: ${tone}. Do NOT output the language name.`;
    }

    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userText }
            ],
            model: modelName, // Usa "mini" para texto, "4o" para voz
            temperature: 0.3,
            max_tokens: 250, 
        });

        const aiText = completion.choices[0].message.content;
        
        // ULTIMO FILTRO DE SEGURIDAD
        if (!aiText || aiText.length < 2) return;
        if (aiText.includes(myLang) && aiText.length < 15) return; // Si dice "Español" y nada más, ignorar.

        sendResponse(ws, userText, aiText, tone, voice);

    } catch (e) { console.error("Error GPT:", e.message); }
}

async function sendResponse(ws, userText, aiText, tone, voice = 'alloy') {
    try {
        const mp3 = await openai.audio.speech.create({ 
            model: "tts-1", voice: voice, input: aiText, speed: 1.1 
        });
        const audioBuffer = Buffer.from(await mp3.arrayBuffer());
        
        ws.send(JSON.stringify({ 
            type: 'full_response', 
            user_text: userText, 
            ai_text: aiText, 
            tone: tone, 
            audio_payload: audioBuffer.toString('base64') 
        }));
    } catch (e) { console.error("Error TTS:", e.message); }
}