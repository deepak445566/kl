// backend/models/IndexingTask.js
import mongoose from 'mongoose';

const indexingTaskSchema = new mongoose.Schema({
    taskId: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['processing', 'completed', 'failed'],
        default: 'processing'
    },
    urls: [{
        url: String,
        status: String,
        errorCode: Number,
        response: Object,
        submittedAt: {
            type: Date,
            default: Date.now
        }
    }],
    summary: {
        totalUrls: Number,
        successfulUrls: Number,
        error429Count: Number,
        otherErrorsCount: Number
    },
    accountUsed: Number,
    startedAt: {
        type: Date,
        default: Date.now
    },
    completedAt: Date
});

export default mongoose.model('IndexingTask', indexingTaskSchema);