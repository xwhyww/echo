import { redirect } from '@sveltejs/kit';

// Sign-up and sign-in are the same phone-OTP flow now.
export function load(): never {
	redirect(302, '/login');
}
