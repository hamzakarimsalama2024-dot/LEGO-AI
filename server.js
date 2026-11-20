import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || "gpt-6.2-sol";

app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(__dirname, "public")));

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const systemRules = `أنت LEGO AI، مساعد تركيب ليجو ودود يتحدث بالعربية المصرية الواضحة.
ساعد المستخدم في بناء مجسمات باستخدام قطع ليجو حقيقية.
لا تدّع معرفة القطع الموجودة معه. إذا لم يذكر مخزونه، اطلب منه وصف القطع أو اقترح بدائل شائعة.
اكتب تعليمات دقيقة خطوة بخطوة: اتجاه القطعة، مكانها، وعدد القطع وألوانها عند الإمكان.
لا تخترع أرقام قطع LEGO أو توافقًا هندسيًا مؤكدًا. وضّح عندما يكون الاقتراح تقريبيًا.
اجعل الإجابة سهلة لطفل، مع تنبيه أن يطلب مساعدة شخص بالغ عند استخدام قطع صغيرة جدًا.`;

function requireAI(res) {
  if (!client) {
    res.status(503).json({
      error: "الخادم لم يتصل بالذكاء الاصطناعي بعد. أضف OPENAI_API_KEY في ملف .env على الخادم ثم أعد تشغيله."
    });
    return false;
  }
  return true;
}

async function ask(input, imageDataUrl) {
  const content = [{ type: "input_text", text: input }];
  if (imageDataUrl) content.push({ type: "input_image", image_url: imageDataUrl, detail: "high" });
  const response = await client.responses.create({
    model: MODEL,
    instructions: systemRules,
    input: [{ role: "user", content }],
    max_output_tokens: 900
  });
  return response.output_text || "لم أستطع تكوين إجابة. جرّب مرة أخرى.";
}

app.post("/api/lego", async (req, res) => {
  if (!requireAI(res)) return;
  try {
    const { action, size, idea, currentStep, inventory, color, image } = req.body || {};
    let prompt = "";
    switch (action) {
      case "start":
        prompt = `ابدأ مشروع ليجو جديدًا بحجم ${size || "متوسط"}.
فكرة المستخدم: ${idea || "اقترح مشروعًا ممتعًا"}.
القطع المتاحة التي وصفها: ${inventory || "غير محددة"}.
اقترح مجسمًا مناسبًا ثم أعطني الخطوة الأولى فقط. اذكر القطع المطلوبة بدقة قدر الإمكان.`;
        break;
      case "next":
        prompt = `المستخدم أنهى الخطوة الحالية: ${currentStep || "الخطوة السابقة"}.
اعرض الخطوة التالية فقط في نفس مشروع الليجو. لا تعِد الخطوات السابقة.`;
        break;
      case "piece":
        prompt = `المستخدم لا يملك هذه القطعة: ${currentStep || "القطعة المذكورة في الخطوة"}.
اقترح بديلًا من قطع ليجو شائعة، واشرح كيف يركبه مع الحفاظ على ثبات المجسم. إذا لم يوجد بديل آمن أو مناسب فقل ذلك.`;
        break;
      case "color":
        prompt = `المستخدم لا يملك اللون ${color || "المطلوب"}.
اقترح لونًا بديلًا مناسبًا، مع الحفاظ على نفس شكل القطعة ومكانها.`;
        break;
      case "explain":
        prompt = `اشرح للمستخدم هذه الخطوة بتفصيل شديد وبأسلوب بسيط: ${currentStep || "الخطوة الحالية"}.
قسّمها إلى حركات صغيرة، ووضح الاتجاه والمكان.`;
        break;
      case "photo":
        if (!image || !/^data:image\/(png|jpeg|webp);base64,/.test(image)) {
          return res.status(400).json({ error: "اختر صورة PNG أو JPG أو WEBP أولًا." });
        }
        prompt = `راجع صورة تركيب الليجو هذه. المشروع/الخطوة المطلوبة: ${currentStep || "غير محددة"}.
صف ما تراه، وهل يبدو التركيب متوافقًا مع الخطوة. لا تجزم بما لا يظهر في الصورة. إذا لاحظت خطأ، اشرح مكانه وكيفية إصلاحه.`;
        break;
      default:
        return res.status(400).json({ error: "طلب غير معروف." });
    }
    const answer = await ask(prompt, action === "photo" ? image : null);
    res.json({ answer });
  } catch (err) {
    console.error("OpenAI request failed:", err?.message || err);
    res.status(500).json({ error: "حصلت مشكلة أثناء الاتصال بالذكاء الاصطناعي. راجع إعداد المفتاح أو حاول مرة أخرى." });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(client) });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`LEGO AI is running at http://localhost:${PORT}`);
});
