const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 5001 },
  },
  { timestamps: true }
);

// Foreign-field index for the $lookup in "posts of a user": equality on
// author, then newest first, so the lookup sub-pipeline needs no in-memory sort.
// Also used by the cascade delete when a user is removed.
postSchema.index({ author: 1, _id: -1 });

module.exports = mongoose.model('Post', postSchema);
