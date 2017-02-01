import admin from 'firebase-admin'
import Queue from 'firebase-queue'
import express from 'express'

const {
  FIREBASE_SERVICE_ACCOUNT_KEY,
  FIREBASE_DATABASE
} = process.env

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(new Buffer(FIREBASE_SERVICE_ACCOUNT_KEY, 'base64').toString())
  ),
  databaseURL: FIREBASE_DATABASE
})

const AUTH_REF = admin.database().ref('authentication')
const QUEUES_REF = AUTH_REF.child('userWritable')
const COMMENTS_QUEUE_REF = QUEUES_REF.child('comments-queue')
const USER_PRIVATE_REF = AUTH_REF.child('userReadable')
const PUBLIC_NOTES_REF = AUTH_REF.child('allMembers').child('notes')
const VIDEOS_REF = AUTH_REF.child('allMembers').child('videos')
const VIDEOS_COMMENTS_REF = AUTH_REF.child('allMembers').child('videosComments')

const commentsQueue = new Queue(COMMENTS_QUEUE_REF, {sanitize: false}, (data, progress, resolve, reject) => {
  // Read and process task data
  progress(10)

  if (data.action === 'delete') {
    admin.auth().verifyIdToken(data.idToken)
      .then(decodedToken => {
        const uid = decodedToken.uid
        PUBLIC_NOTES_REF.child(data.language).child(data.note_id).child('comments').child(data.target).child('uid').once('value').then(snapshot => {
          if (snapshot.val() === uid) {
            PUBLIC_NOTES_REF.child(data.language).child(data.note_id).child('comments').child(data.target).remove()
            COMMENTS_QUEUE_REF.child(data._id).remove()
            resolve()
          } else {
            reject()
          }
        })
      }).catch(err => {
        console.log(err)
      })
  }

  if (data.action === 'edit') {
    admin.auth().verifyIdToken(data.idToken)
      .then(decodedToken => {
        const uid = decodedToken.uid
        PUBLIC_NOTES_REF.child(data.language).child(data.note_id).child('comments').child(data.comment_id).child('uid').once('value').then(snapshot => {
          if (snapshot.val() === uid) {
            USER_PRIVATE_REF.child(uid).child('notes').child(data.note_id).child('comments').child(data.comment_id).child('comment').set(data.data.text)
            USER_PRIVATE_REF.child(uid).child('notes').child(data.note_id).child('comments').child(data.comment_id).child('edit_date').set(data.data.edit_date)
            PUBLIC_NOTES_REF.child(data.language).child(data.note_id).child('comments').child(data.comment_id).child('comment').set(data.data.text)
            PUBLIC_NOTES_REF.child(data.language).child(data.note_id).child('comments').child(data.comment_id).child('edit_date').set(data.data.edit_date)
            resolve()
          } else {
            reject()
          }
        })
      }).catch(err => {
        console.log(err)
        reject()
      })
  }

  if (data.action === 'add') {
    admin.auth().verifyIdToken(data.idToken)
      .then(decodedToken => {
        data.comment.uid = decodedToken.uid
        return PUBLIC_NOTES_REF.child(data.language).child(data.note_id).child('comments').child(data._id).set(data.comment)
          .then(() => {
            progress(20)
            COMMENTS_QUEUE_REF.child(data._id).remove()
          })
          .then(resolve)
          .catch(reject)
      })
  }

  if (data.action === 'video-delete') {
    admin.auth().verifyIdToken(data.idToken)
      .then(decodedToken => {
        const uid = decodedToken.uid
        VIDEOS_REF.child(data.video_id).child('comments').child(data.language).child(data.target).child('uid').once('value').then(snapshot => {
          if (snapshot.val() === uid) {
            VIDEOS_REF.child(data.video_id).child('comments').child(data.language).child(data.target).remove()
            VIDEOS_COMMENTS_REF.child(data.language).child(data.target).remove()
            COMMENTS_QUEUE_REF.child(data._id).remove()
            resolve()
          } else {
            reject()
          }
        })
      }).catch(err => {
        console.log(err)
        reject()
      })
  }

  if (data.action === 'video-edit') {
    admin.auth().verifyIdToken(data.idToken)
      .then(decodedToken => {
        const uid = decodedToken.uid
        VIDEOS_REF.child(data.video_id).child('comments').child(data.language).child(data.comment_id).child('uid').once('value').then(snapshot => {
          if (snapshot.val() === uid) {
            VIDEOS_REF.child(data.video_id).child('comments').child(data.language).child(data.comment_id).child('comment').set(data.data.text)
            VIDEOS_REF.child(data.video_id).child('comments').child(data.language).child(data.comment_id).child('edit_date').set(data.data.edit_date)
            VIDEOS_COMMENTS_REF.child(data.language).child(data.comment_id).child('comment').set(data.data.text)
            VIDEOS_COMMENTS_REF.child(data.language).child(data.comment_id).child('edit_date').set(data.data.edit_date)
            resolve()
          } else {
            reject()
          }
        })
      }).catch(err => {
        console.log(err)
        reject()
      })
  }

  if (data.action === 'video-add') {
    admin.auth().verifyIdToken(data.idToken)
      .then(decodedToken => {
        data.comment.uid = decodedToken.uid
        VIDEOS_COMMENTS_REF.child(data.language).child(data._id).set(data.comment)
        return VIDEOS_REF.child(data.video_id).child('comments').child(data.language).child(data._id).set(data.comment)
          .then(() => {
            progress(20)
            COMMENTS_QUEUE_REF.child(data._id).remove()
          })
          .then(resolve())
          .catch(reject())
      }).catch(() => reject())
  }
})

process.on('SIGINT', () => {
  commentsQueue.shutdown().then(() => {
    process.exit(0)
  })
})

const app = express()

app.get('/', (req, res) => {
  res.send(`<h1>Hello Universe!</h1>
    <h2>The current time is: ${new Date().toISOString()}!</h2>
    `)
})

app.listen(3000, () => {
  console.log('Example app listening on port 3000!')
})
