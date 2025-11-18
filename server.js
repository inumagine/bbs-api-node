// server.js （CommonJS版）

const express = require('express');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const app = express();
app.use(express.json());

// DB接続プール
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 共通エラーハンドラ
function handleError(res, err) {
  console.error(err);
  res.status(500).json({ error: 'internal_server_error' });
}

// A: スレ一覧取得
app.get('/threads', async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      const query = `
        select
          t.id          as thread_id,
          t.title,
          t.author      as thread_author,
          t.created_at  as thread_created_at,
          count(p.id)   as reply_count
        from public.bbs_threads t
        left join public.bbs_posts p
          on p.thread_id = t.id
        group by t.id
        order by t.created_at desc;
      `;
      const result = await client.query(query);
      res.json(result.rows);
    } finally {
      client.release();
    }
  } catch (err) {
    handleError(res, err);
  }
});

// C: 新規スレ作成
app.post('/threads', async (req, res) => {
  const { title, body, author } = req.body;

  if (!title || !body || !author) {
    return res.status(400).json({ error: 'title, body, author は必須です' });
  }

  try {
    const client = await pool.connect();
    try {
      const query = `
        insert into public.bbs_threads (title, body, author)
        values ($1, $2, $3)
        returning id, title, body, author, created_at;
      `;
      const values = [title, body, author];
      const result = await client.query(query, values);
      res.status(201).json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (err) {
    handleError(res, err);
  }
});

// B: スレ詳細 + レス一覧
app.get('/threads/:id', async (req, res) => {
  const threadId = Number(req.params.id);
  if (!Number.isInteger(threadId)) {
    return res.status(400).json({ error: 'invalid_thread_id' });
  }

  try {
    const client = await pool.connect();
    try {
      const threadResult = await client.query(
        'select id, title, body, author, created_at from public.bbs_threads where id = $1',
        [threadId]
      );

      if (threadResult.rowCount === 0) {
        return res.status(404).json({ error: 'thread_not_found' });
      }

      const postsResult = await client.query(
        'select id, thread_id, body, author, created_at from public.bbs_posts where thread_id = $1 order by id',
        [threadId]
      );

      res.json({
        thread: threadResult.rows[0],
        posts: postsResult.rows,
      });
    } finally {
      client.release();
    }
  } catch (err) {
    handleError(res, err);
  }
});

// D: レス投稿
app.post('/threads/:id/posts', async (req, res) => {
  const threadId = Number(req.params.id);
  const { body, author } = req.body;

  if (!Number.isInteger(threadId)) {
    return res.status(400).json({ error: 'invalid_thread_id' });
  }
  if (!body || !author) {
    return res.status(400).json({ error: 'body, author は必須です' });
  }

  try {
    const client = await pool.connect();
    try {
      const query = `
        insert into public.bbs_posts (thread_id, body, author)
        values ($1, $2, $3)
        returning id, thread_id, body, author, created_at;
      `;
      const values = [threadId, body, author];
      const result = await client.query(query, values);
      res.status(201).json(result.rows[0]);
    } finally {
      client.release();
    }
  } catch (err) {
    handleError(res, err);
  }
});

// サーバー起動
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`BBS API listening on port ${port}`);
});
