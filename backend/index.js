const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const multer = require('multer');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const sendgrid = require('@sendgrid/mail');
const fs = require('fs');
const FormData = require('form-data');

dotenv.config();
const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(bodyParser.json());

sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

// Google Sheets API Authentication
const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials/service-account.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets('v4');

// ฟังก์ชันส่งอีเมลด้วย SendGrid
async function sendEmail(details, filePath) {
    const msg = {
        to: details.receiverEmail,
        from: process.env.EMAIL,
        subject: 'การสนับสนุนของคุณได้รับการตรวจสอบสำเร็จ!',
        text: `รายละเอียดการโอนเงิน: ${JSON.stringify(details)}`,
    };

    if (filePath) {
        const fileContent = fs.readFileSync(filePath).toString("base64");
        msg.attachments = [
            {
                content: fileContent,
                filename: "support-details.jpg",
                type: "image/jpeg",
                disposition: "attachment"
            }
        ];
    }

    await sendgrid.send(msg);
}

// เส้นทาง API สำหรับตรวจสอบสลิป
app.post('/check-slip', upload.single('file'), async (req, res) => {
    try {
        const { amount } = req.body;  // รับจำนวนเงินจาก body
        const file = req.file;  // รับไฟล์ที่อัปโหลดจากผู้ใช้
        const path = file.path;
        const buffer = fs.readFileSync(path);  // อ่านไฟล์

        const res = await axios.post(
            `https://api.slipok.com/api/line/apikey/${process.env.Brance}`,
            {
              files: buffer,
              log: true,
              // amount: number, // Add this to check with amount of the slip
            },
            {
              headers: {
                "x-authorization": apiKey,
                "Content-Type": "multipart/form-data",
              },
            }
          );
  

        // ตรวจสอบการตอบกลับจาก SlipOK API
        if (response.data.success && response.data.amount > 10000) {
            // ส่งอีเมลเมื่อยอดเงินเกิน 10,000 บาท
            await sendEmail(response.data, file ? file.path : null);
        }

        // บันทึกข้อมูลลงใน Google Sheets
        const authClient = await auth.getClient();
        await sheets.spreadsheets.values.append({
            auth: authClient,
            spreadsheetId: process.env.SPREADSHEET_ID,
            range: 'Sheet1!A1',
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[response.data.transRef, response.data.amount, new Date().toISOString()]] },
        });

        res.status(200).json({ message: 'สลิปได้รับการตรวจสอบเรียบร้อย' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบสลิป' });
    }
});

app.listen(process.env.PORT, () => {
    console.log(`Server started on port ${process.env.PORT}`);
});