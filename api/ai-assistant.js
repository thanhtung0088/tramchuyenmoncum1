// api/ai-assistant.js
//
// Vercel Serverless Function — cầu nối giữa trợ lý AI trên trang web
// và Gemini API của Google. API key được giữ bí mật ở đây (biến môi
// trường trên Vercel), KHÔNG bao giờ nhúng trực tiếp vào file HTML/JS
// phía trình duyệt, vì như vậy ai cũng xem được và dùng ké.
//
// Cách thiết lập:
//  1. Lấy API key miễn phí tại https://aistudio.google.com/apikey
//  2. Vào Vercel Dashboard → chọn project → Settings → Environment Variables
//     → thêm biến tên GEMINI_API_KEY, giá trị là API key vừa lấy → Save
//  3. Deploy lại (Vercel sẽ tự deploy lại khi có commit mới, hoặc bấm
//     "Redeploy" trong tab Deployments nếu chỉ đổi biến môi trường)

const SYSTEM_PROMPT =
  'Bạn là trợ lý AI của "Trạm Chuyên Môn Cụm" — cổng thông tin điện tử ' +
  'dùng chung cho một cụm liên trường phổ thông tại Việt Nam, xây dựng ' +
  'theo Công văn 4069/BGDĐT-GDPT. Đối tượng sử dụng là giáo viên và cán ' +
  'bộ quản lý giáo dục. Hãy trả lời ngắn gọn, thân thiện, chính xác, ' +
  'bằng tiếng Việt. Có thể hỗ trợ: gợi ý ý tưởng bài dạy, tóm tắt văn ' +
  'bản, giải đáp thắc mắc về sinh hoạt chuyên môn, hướng nghiệp, và ' +
  'hướng dẫn sử dụng các phân hệ trên trang web này.';

// Có thể đổi tên model tại đây nếu Google phát hành model mới hơn.
// Xem danh sách model hiện hành tại https://ai.google.dev/gemini-api/docs/models
const MODEL = 'gemini-3.1-flash-lite';

module.exports = async (req, res) => {

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Chỉ hỗ trợ phương thức POST.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    res.status(500).json({
      error: 'Server chưa được cấu hình GEMINI_API_KEY. Vui lòng thêm biến môi trường này trong Vercel Dashboard rồi deploy lại.'
    });
    return;
  }

  let message = '';

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    message = (body && body.message ? String(body.message) : '').trim();
  } catch (e) {
    res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ.' });
    return;
  }

  if (!message) {
    res.status(400).json({ error: 'Thiếu nội dung câu hỏi.' });
    return;
  }

  if (message.length > 2000) {
    res.status(400).json({ error: 'Câu hỏi quá dài, thầy/cô rút gọn giúp nhé.' });
    return;
  }

  try {

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: message }]
            }
          ],
          generationConfig: {
            maxOutputTokens: 600,
            temperature: 0.7
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText);
      res.status(502).json({ error: 'Trợ lý AI đang gặp sự cố, thầy/cô thử lại sau ít phút.' });
      return;
    }

    const data = await geminiRes.json();

    const reply =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text
        ? data.candidates[0].content.parts[0].text
        : 'Xin lỗi, mình chưa có câu trả lời cho câu hỏi này.';

    res.status(200).json({ reply });

  } catch (err) {
    console.error('Lỗi gọi Gemini API:', err);
    res.status(500).json({ error: 'Lỗi server khi kết nối trợ lý AI.' });
  }

};

