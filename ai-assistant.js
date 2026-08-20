// api/ai-assistant.js
// Vercel serverless function - proxy an toàn tới Gemini API cho "Trợ lý Kế toán AI".
// API key KHÔNG bao giờ lộ ra frontend: chỉ nằm trong biến môi trường GEMINI_API_KEY trên Vercel.
//
// Cách cấu hình sau khi deploy:
//   Vercel Dashboard -> Project -> Settings -> Environment Variables
//   Thêm: GEMINI_API_KEY = <khoá API Gemini của thầy, lấy tại aistudio.google.com/apikey>
// Deploy lại (hoặc redeploy) sau khi thêm biến môi trường.

const SYSTEM_PROMPT = `Bạn là Trợ lý Kế toán AI của "Sổ Đối Soát" - hệ thống kế toán tài chính cho trường phổ thông tại Việt Nam.
Vai trò: hỗ trợ kế toán/thủ quỹ trường học hiểu và xử lý kết quả đối soát thu học phí, công nợ, và đối chiếu ngân hàng.

Nguyên tắc bắt buộc:
- Am hiểu chế độ kế toán hành chính sự nghiệp (Thông tư 107/2017/TT-BTC), Thông tư 48/2019/TT-BTC về trích lập dự phòng nợ phải thu khó đòi, thực tiễn thu học phí đa kênh tại trường phổ thông Việt Nam, và nghiệp vụ tiền lương viên chức giáo dục (hệ số lương theo Nghị định 204/2004/NĐ-CP, phụ cấp ưu đãi đứng lớp, phụ cấp thâm niên nhà giáo, trích BHXH/BHYT/BHTN, thuế TNCN lũy tiến từng phần theo Luật Thuế TNCN 2025).
- KHÔNG tự ý kết luận thay kế toán viên. Với khoản "CẦN XÁC MINH" hoặc "KHOẢN LẠ", luôn nhắc người dùng xác minh nguồn gốc trước khi hạch toán, không khẳng định chắc chắn khi dữ liệu chưa đủ.
- Trả lời ngắn gọn, đúng trọng tâm, bằng tiếng Việt, giọng điệu chuyên nghiệp nhưng dễ hiểu (người dùng không chuyên sâu công nghệ).
- Nếu người dùng hỏi ngoài phạm vi kế toán/tài chính trường học, vẫn trả lời hữu ích nhưng có thể nhắc đây không phải chuyên môn chính.
- Không thay thế vai trò kiểm toán viên hoặc tư vấn pháp lý chính thức; với các câu hỏi phức tạp về thuế/pháp lý, khuyến nghị thầy/cô tham khảo thêm cơ quan thuế hoặc kế toán trưởng.`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Chỉ hỗ trợ POST' }); return; }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Chưa cấu hình GEMINI_API_KEY trên Vercel. Vào Settings -> Environment Variables để thêm.' });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const question = (body && body.question || '').toString().trim();
    const context = (body && body.context || '').toString().trim();
    const history = Array.isArray(body && body.history) ? body.history : [];

    if (!question) { res.status(400).json({ error: 'Thiếu câu hỏi.' }); return; }

    const contents = [];
    for (const turn of history.slice(-8)) {
      if (turn && turn.role && turn.text) {
        contents.push({ role: turn.role === 'ai' ? 'model' : 'user', parts: [{ text: String(turn.text) }] });
      }
    }
    const userText = context
      ? `Bối cảnh dữ liệu đối soát hiện tại:\n${context}\n\nCâu hỏi của kế toán viên: ${question}`
      : question;
    contents.push({ role: 'user', parts: [{ text: userText }] });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      res.status(resp.status).json({ error: data?.error?.message || 'Lỗi gọi Gemini API' });
      return;
    }
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || 'Xin lỗi, em chưa có câu trả lời phù hợp.';
    res.status(200).json({ answer: text });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi xử lý: ' + err.message });
  }
};
