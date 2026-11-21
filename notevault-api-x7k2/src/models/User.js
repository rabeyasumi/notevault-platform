const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 120,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email is not valid'],
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    interests: {
      type: [{ type: String, trim: true, lowercase: true, minlength: 1, maxlength: 30 }],
      default: [],
      validate: { validator: (list) => list.length <= 20, message: 'At most 20 interests' },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.pre('validate', function removeDuplicateInterests() {
  this.interests = [...new Set(this.interests)];
});

// Login lookup (findOne by email) + uniqueness guarantee.
userSchema.index({ email: 1 }, { unique: true });

// Multikey index: lets the $match stage of the "users grouped by interests"
// aggregation read the index instead of scanning the whole collection.
userSchema.index({ interests: 1 });

module.exports = mongoose.model('User', userSchema);
