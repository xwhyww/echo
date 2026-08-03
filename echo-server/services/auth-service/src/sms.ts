// SMS delivery abstraction. Dev has no real provider: the code lands in the
// service log (and is echoed back to the client outside production). Wiring a
// real gateway (Twilio, SMS.ru, ...) later means implementing sendSms only.
export async function sendSms(phone: string, text: string): Promise<void> {
	console.log(`[auth-service] SMS to ${phone}: ${text}`);
}
