import express from 'express';
import cors from 'cors';
import ytdl from '@distube/ytdl-core';
import instagramGetUrl from 'instagram-url-direct';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { rateLimit } from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import fetch from 'node-fetch';
import NodeCache from 'node-cache';
import compression from 'compression';
import pino from 'pino';

// Initialize cache and logger
const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache
const logger = pino();

const app = express();

// Add compression early in the middleware chain
app.use(compression());

// Add performance monitoring middleware
app.use((req, res, next) => {
    req.startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - req.startTime;
        logger.info({
            method: req.method,
            url: req.url,
            duration,
            status: res.statusCode,
            memory: process.memoryUsage().heapUsed
        });
    });
    next();
});

// Define allowed origins
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://instasave.world', 'https://www.instasave.world', 'http://localhost:3000']
    : ['http://localhost:3000'];

// Simple CORS configuration
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(new Error('CORS policy violation'), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Origin', 'Accept'],
    credentials: true
}));

// Add basic security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Rest of your middleware
app.use(express.json());

// Swagger setup
const specs = swaggerJsdoc({
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Video Downloader API',
            version: '1.0.0',
            description: 'API for downloading videos from YouTube and Instagram',
            contact: {
                name: 'API Support',
                url: process.env.NODE_ENV === 'production'
                    ? 'https://your-api-domain.onrender.com'
                    : 'http://localhost:3000',
            },
        },
        servers: [
            {
                url: process.env.NODE_ENV === 'production'
                    ? 'https://your-api-domain.onrender.com'
                    : 'http://localhost:3000',
                description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
            },
        ],
        components: {
            schemas: {
                VideoResponse: {
                    type: 'object',
                    properties: {
                        success: {
                            type: 'boolean',
                            description: 'Operation success status'
                        },
                        platform: {
                            type: 'string',
                            enum: ['youtube', 'instagram'],
                            description: 'Video platform'
                        },
                        title: {
                            type: 'string',
                            description: 'Video title'
                        },
                        thumbnail: {
                            type: 'string',
                            description: 'Thumbnail URL'
                        },
                        duration: {
                            type: 'string',
                            description: 'Video duration in seconds'
                        },
                        author: {
                            type: 'string',
                            description: 'Content creator name'
                        },
                        download_url: {
                            type: 'string',
                            description: 'Direct download URL'
                        }
                    }
                },
                Error: {
                    type: 'object',
                    properties: {
                        success: {
                            type: 'boolean',
                            default: false
                        },
                        error: {
                            type: 'string',
                            description: 'Error message'
                        }
                    }
                }
            }
        }
    },
    apis: ['./server.js'],
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

/**
 * @swagger
 * /ping:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is up and running
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: pong
 */
app.get('/ping', (req, res) => {
    res.send('pong');
});

// Root route
app.get('/', (req, res) => {
    res.json({
        success: true,
        name: 'Video Downloader API',
        version: '1.0.0',
        description: 'API for downloading videos from YouTube and Instagram',
        endpoints: {
            health: '/ping',
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
        const { url, platform } = req.query;
        
        if (!url || !platform) {
            return res.status(400).json({
                success: false,
                error: 'URL and platform are required'
            });
        }

        // Try cache first
        const cacheKey = `video_${url}`;
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            logger.info({ url, source: 'cache' }, 'Cache hit');
            return res.json(cachedData);
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
                try {
                    const info = await ytdl.getInfo(url, {
                        requestOptions: {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Accept': '*/*',
                                'Accept-Language': 'en-US,en;q=0.9',
                                'Cookie': 'CONSENT=YES+; Path=/',
                            }
                        }
                    });
                    
                    videoInfo = {
                        success: true,
                        platform: 'youtube',
                        title: info.videoDetails.title,
                        thumbnail: info.videoDetails.thumbnails[0].url,
                        duration: info.videoDetails.lengthSeconds,
                        author: info.videoDetails.author.name,
                        download_url: await getYouTubeDownloadUrl(url, info)
                    };

                    // Cache the result
                    cache.set(cacheKey, videoInfo);
                    logger.info({ url, source: 'api' }, 'Cache miss, fetched from API');

                } catch (error) {
                    logger.error({ url, error: error.message }, 'YouTube processing error');
                    return res.status(400).json({
                        success: false,
                        error: 'Unable to process YouTube video. ' + error.message
                    });
                }
                break;

            case 'instagram':
                try {
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

                    // Cache the result
                    cache.set(cacheKey, videoInfo);
                    logger.info({ url, source: 'api' }, 'Cache miss, fetched from API');

                } catch (error) {
                    logger.error({ url, error: error.message }, 'Instagram processing error');
                    return res.status(400).json({
                        success: false,
                        error: 'Unable to process Instagram video. ' + error.message
                    });
                }
                break;
            default:
                return res.status(400).json({
                    success: false,
                    error: 'Unsupported platform'
                });
        }

        res.json(videoInfo);

    } catch (error) {
        logger.error({ error: error.message }, 'General error in video endpoint');
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Helper function to get YouTube download URL
async function getYouTubeDownloadUrl(url, info) {
    try {
        const format = ytdl.chooseFormat(info.formats, { 
            quality: 'highest',
            filter: 'videoandaudio'
        });

        // Add required headers for YouTube requests
        const requestOptions = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive',
                'Cookie': 'CONSENT=YES+; Path=/',  // Basic consent cookie
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
            }
        };

        // Add these options to ytdl
        return ytdl(url, {
            format: format,
            requestOptions: requestOptions
        }).on('error', (err) => {
            console.error('YouTube download error:', err);
            throw err;
        });
    } catch (error) {
        console.error('Error getting YouTube URL:', error);
        throw new Error('Unable to process YouTube video. Please try again later.');
    }
}

// Update error handling middleware
app.use((err, req, res, next) => {
    logger.error(err);
    
    // Ensure we're sending JSON response
    res.setHeader('Content-Type', 'application/json');
    
    if (err.message.includes('Sign in to confirm')) {
        return res.status(403).json({
            success: false,
            error: 'This video requires age verification. Please try another video.'
        });
    }
    
    // Generic error response
    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' 
            ? 'An unexpected error occurred' 
            : err.message
    });
});

// Update 404 handler
app.use((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'The requested resource does not exist'
    });
});

// Add general error handler for uncaught exceptions
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    // Ensure clean shutdown if needed
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Handle the error appropriately
});

// Self-ping mechanism to prevent idle timeout
function setupPingService() {
    const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes
    const url = process.env.NODE_ENV === 'production' 
        ? 'https://isave-backend-sjwi.onrender.com/ping'
        : `http://localhost:${process.env.PORT || 3000}/ping`;

    setInterval(async () => {
        try {
            const response = await fetch(url);
            console.log(`Ping status: ${response.status === 200 ? 'OK' : 'Failed'}`);
        } catch (error) {
            console.error('Ping failed:', error.message);
        }
    }, PING_INTERVAL);
}

// Start server
const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
    console.log(`API Server running on port ${port}`);
    
    // Start ping service in production
    if (process.env.NODE_ENV === 'production') {
        setupPingService();
        console.log('Ping service started');
    }
}); 