const mongoose = require('mongoose');
const Post = require('./models/Post');

// Scenario 1 - users grouped by interest (run on the users collection, one aggregate() call).
//  $match   : the only stage that can use an index; { interests: { $gt: '' } } reads the multikey
//             interests_1 index and drops users without interests (they would vanish at $unwind anyway).
//  $unwind  : one document per (user, interest) pair.
//  $group   : one document per interest with its users.
//  $facet   : one page of groups plus the total number of groups, in the same single call.
const usersByInterestPipeline = ({ skip, limit }) => [
  { $match: { interests: { $gt: '' } } },
  { $project: { name: 1, interests: 1 } },
  { $unwind: '$interests' },
  { $group: { _id: '$interests', count: { $sum: 1 }, users: { $push: { _id: '$_id', name: '$name' } } } },
  { $sort: { _id: 1 } },
  {
    $facet: {
      data: [{ $skip: skip }, { $limit: limit }, { $project: { _id: 0, interest: '$_id', count: 1, users: 1 } }],
      total: [{ $count: 'n' }],
    },
  },
];

// Scenario 2 - posts of one user (run on the users collection, single $lookup into posts).
//  $match  : _id lookup, served by the default _id index; an unknown user yields no document (404).
//  $lookup : localField/foreignField equality is served by posts { author: 1, _id: -1 }; the
//            sub-pipeline sorts newest first and pages. limit + 1 tells the caller if a next page exists.
const userPostsPipeline = (userId, { skip, limit }) => [
  { $match: { _id: new mongoose.Types.ObjectId(userId) } },
  { $project: { name: 1 } },
  {
    $lookup: {
      from: Post.collection.name,
      localField: '_id',
      foreignField: 'author',
      pipeline: [{ $sort: { _id: -1 } }, { $skip: skip }, { $limit: limit + 1 }, { $project: { author: 0, __v: 0 } }],
      as: 'posts',
    },
  },
];

module.exports = { usersByInterestPipeline, userPostsPipeline };
