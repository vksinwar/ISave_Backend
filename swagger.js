export const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Video Downloader API',
            version: '1.0.0',
            description: `REST API for downloading videos from YouTube and Instagram.
                        Rate limit: 100 requests per IP address per hour.`,
            contact: {
                name: 'API Support',
                url: 'http://localhost:3000/api-docs',
            },
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Development server',
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
}; 