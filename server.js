import express from 'express';
import cors from 'cors';
import ytdl from '@distube/ytdl-core';
import instagramGetUrl from 'instagram-url-direct';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { rateLimit } from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

const app = express();

// CORS configuration for production
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://your-frontend-domain.com'] // Add your frontend domains
        : '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
};

app.use(cors(corsOptions));

// Middleware
app.use(express.json());

// Swagger setup
const specs = swaggerJsdoc({
    definition: {
        servers: [
            {
                url: process.env.NODE_ENV === 'production'
                    ? 'https://your-api-domain.onrender.com'
                    : 'http://localhost:3000',
                description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
            },
        ],
        // ... rest of swagger config
    }
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// Rate limiting
const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100,
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again after an hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Root route (Move this to the top of routes)
app.get('/', (req, res) => {
    res.json({
        success: true,
        name: 'Video Downloader API',
        version: '1.0.0',
        description: 'API for downloading videos from YouTube and Instagram',
        endpoints: {
            documentation: '/api-docs',
            video: '/api/video?url=VIDEO_URL'
        }
    });
});

/**
 * @swagger
 * /api/video:
 *   get:
 *     summary: Get video information and download URL
 *     tags: [Video]
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: Video URL (YouTube or Instagram)
 *     responses:
 *       200:
 *         description: Video information and download URL
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VideoResponse'
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/api/video', limiter, async (req, res) => {
    try {
        const { url } = req.query;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL is required'
            });
        }

        const platform = detectPlatform(url);
        if (!platform) {
            return res.status(400).json({
                success: false,
                error: 'Unsupported platform. Please provide a valid YouTube or Instagram URL'
            });
        }

        let videoInfo;

        switch (platform) {
            case 'youtube':
                if (!ytdl.validateURL(url)) {
                    return res.status(400).json({ 
                        success: false,
                        error: 'Invalid YouTube URL' 
                    });
                }
                const info = await ytdl.getInfo(url);
                videoInfo = {
                    success: true,
                    platform: 'youtube',
                    title: info.videoDetails.title,
                    thumbnail: info.videoDetails.thumbnails[0].url,
                    duration: info.videoDetails.lengthSeconds,
                    author: info.videoDetails.author.name,
                    download_url: await getYouTubeDownloadUrl(url, info)
                };
                break;

            case 'instagram':
                const igResponse = await instagramGetUrl(url);
                if (igResponse.url_list.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'No downloadable URL found'
                    });
                }
                videoInfo = {
                    success: true,
                    platform: 'instagram',
                    download_url: igResponse.url_list[0],
                    type: igResponse.type
                };
                break;
        }

        res.json(videoInfo);

    } catch (error) {
        console.error('Video processing error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Helper function to detect platform
function detectPlatform(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();

        if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
            return 'youtube';
        }
        if (hostname.includes('instagram.com')) {
            return 'instagram';
        }
        return null;
    } catch {
        return null;
    }
}

// Helper function to get YouTube download URL
async function getYouTubeDownloadUrl(url, info) {
    const format = ytdl.chooseFormat(info.formats, { 
        quality: 'highest',
        filter: 'videoandaudio'
    });
    return format.url;
}

// Error handling middleware (Move these to the end)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler (This should be the last route)
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'The requested resource does not exist'
    });
});

// Add security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
    console.log(`API Server running on port ${port}`);
}); 