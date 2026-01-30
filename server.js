const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('railway') 
        ? { rejectUnauthorized: false } 
        : false
});

// Initialize database tables
async function initDB() {
    const client = await pool.connect();
    try {
        // Projects table
        await client.query(`
            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `);
        
        // Layouts table with project reference
        await client.query(`
            CREATE TABLE IF NOT EXISTS layouts (
                id SERIAL PRIMARY KEY,
                project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                filename VARCHAR(255) NOT NULL,
                name VARCHAR(100) NOT NULL,
                data JSONB NOT NULL,
                saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(project_id, filename)
            )
        `);
        
        // Add project_id column if it doesn't exist (migration for existing data)
        await client.query(`
            ALTER TABLE layouts 
            ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE
        `);
        
        console.log('Database initialized');
    } catch (err) {
        console.error('Error initializing database:', err);
        throw err;
    } finally {
        client.release();
    }
}

app.use(express.json({ limit: '5mb' }));
app.use(express.static(__dirname));

// ============ PROJECTS API ============

// List all projects
app.get('/api/projects', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.id, p.name, p.description, p.created_at as "createdAt", 
                   p.updated_at as "updatedAt",
                   COUNT(l.id) as "layoutCount",
                   MAX(l.saved_at) as "lastSaved"
            FROM projects p
            LEFT JOIN layouts l ON l.project_id = p.id
            GROUP BY p.id
            ORDER BY p.updated_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error listing projects:', err);
        res.status(500).json({ error: err.message });
    }
});

// Create a new project
app.post('/api/projects', async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Project name is required' });
        }
        
        const result = await pool.query(`
            INSERT INTO projects (name, description)
            VALUES ($1, $2)
            RETURNING id, name, description, created_at as "createdAt", updated_at as "updatedAt"
        `, [name, description || null]);
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error creating project:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get a specific project
app.get('/api/projects/:id', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, description, created_at as "createdAt", updated_at as "updatedAt"
            FROM projects WHERE id = $1
        `, [req.params.id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error getting project:', err);
        res.status(500).json({ error: err.message });
    }
});

// Update a project
app.put('/api/projects/:id', async (req, res) => {
    try {
        const { name, description } = req.body;
        const result = await pool.query(`
            UPDATE projects 
            SET name = COALESCE($1, name), 
                description = COALESCE($2, description),
                updated_at = NOW()
            WHERE id = $3
            RETURNING id, name, description, created_at as "createdAt", updated_at as "updatedAt"
        `, [name, description, req.params.id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating project:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete a project (cascades to layouts)
app.delete('/api/projects/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting project:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ LAYOUTS API ============

// List layouts for a project
app.get('/api/projects/:projectId/layouts', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT filename, name, saved_at as "savedAt", 
                   LENGTH(data::text) as size
            FROM layouts 
            WHERE project_id = $1
            ORDER BY saved_at DESC
        `, [req.params.projectId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error listing layouts:', err);
        res.status(500).json({ error: err.message });
    }
});

// Save a new layout to a project
app.post('/api/projects/:projectId/layouts', async (req, res) => {
    try {
        const projectId = req.params.projectId;
        const data = req.body;
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const safeName = (data.name || 'layout').replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 30);
        const filename = `${safeName}_${timestamp}.json`;
        
        data.savedAt = now.toISOString();
        data.filename = filename;
        
        await pool.query(`
            INSERT INTO layouts (project_id, filename, name, data, saved_at)
            VALUES ($1, $2, $3, $4, $5)
        `, [projectId, filename, data.name || 'Untitled', data, now]);
        
        // Update project's updated_at
        await pool.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [projectId]);
        
        res.json({ success: true, filename, savedAt: data.savedAt });
    } catch (err) {
        console.error('Error saving layout:', err);
        res.status(500).json({ error: err.message });
    }
});

// Load a specific layout from a project
app.get('/api/projects/:projectId/layouts/:filename', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT data FROM layouts WHERE project_id = $1 AND filename = $2',
            [req.params.projectId, req.params.filename]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Layout not found' });
        }
        
        res.json(result.rows[0].data);
    } catch (err) {
        console.error('Error loading layout:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete a layout from a project
app.delete('/api/projects/:projectId/layouts/:filename', async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM layouts WHERE project_id = $1 AND filename = $2',
            [req.params.projectId, req.params.filename]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting layout:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============ LEGACY API (backwards compatibility) ============

// List all layouts (no project filter)
app.get('/api/layouts', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT l.filename, l.name, l.saved_at as "savedAt", 
                   LENGTH(l.data::text) as size, p.name as "projectName", l.project_id as "projectId"
            FROM layouts l
            LEFT JOIN projects p ON p.id = l.project_id
            ORDER BY l.saved_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error listing layouts:', err);
        res.status(500).json({ error: err.message });
    }
});

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server after DB init
initDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Floor Plan app running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error('Failed to start:', err);
        process.exit(1);
    });
