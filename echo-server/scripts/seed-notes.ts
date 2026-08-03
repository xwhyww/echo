import postgres from 'postgres';

const DB_URL = 'postgresql://echo:echo_dev@localhost:5432/echo_chats';
const TOTAL = 5000;

async function main() {
	const sql = postgres(DB_URL);

	// Find the self-chat (user1_id = user2_id)
	const selfChats = await sql`
		SELECT pc.id as chat_id, pc.user1_id as user_id
		FROM personal_chats pc
		WHERE pc.user1_id = pc.user2_id
		LIMIT 1
	`;

	if (selfChats.length === 0) {
		console.error('No self-chat found. Open your Notes chat first to create it.');
		await sql.end();
		process.exit(1);
	}

	const { chat_id, user_id } = selfChats[0];
	console.log(`Found self-chat: ${chat_id} for user: ${user_id}`);
	console.log(`Inserting ${TOTAL} messages...`);

	const batchSize = 500;
	for (let batch = 0; batch < TOTAL; batch += batchSize) {
		const count = Math.min(batchSize, TOTAL - batch);
		const values = [];
		for (let i = 0; i < count; i++) {
			const num = batch + i + 1;
			const offset = TOTAL - num; // oldest first
			values.push({
				chat_id,
				author_id: user_id,
				content: `Test message #${num} — Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
				created_at: new Date(Date.now() - offset * 1000),
				updated_at: new Date(Date.now() - offset * 1000),
			});
		}

		await sql`
			INSERT INTO personal_messages ${sql(values, 'chat_id', 'author_id', 'content', 'created_at', 'updated_at')}
		`;
		console.log(`  Inserted ${batch + count}/${TOTAL}`);
	}

	console.log('Done!');
	await sql.end();
}

main().catch(console.error);
