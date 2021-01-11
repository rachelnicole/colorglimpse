'use strict';

const http = require('http');
const axios = require('axios');
const { createCanvas } = require('canvas')
const canvas = createCanvas(1280, 1280);
const ctx = canvas.getContext('2d');
const fs = require('fs');
const path = require('path');
const Twit = require('twit');
const { v4: uuidv4 } = require('uuid');



let AWS_ACCESS_KEY_ID = '';
let AWS_SECRET_ACCESS_KEY = '';


let T = new Twit({
  consumer_key: '',
  consumer_secret: '',
  access_token: '',
  access_token_secret: ''
});

let s3 = new AWS.S3({
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessKey: AWS_SECRET_ACCESS_KEY
});

let uploadToS3 = (bucketName, keyPrefix, filePath) => {
  
  var fileName = path.basename(filePath);
  var fileStream = fs.createReadStream(filePath);

  // If you want to save to "my-bucket/{prefix}/{filename}"
  //                    ex: "my-bucket/my-pictures-folder/my-picture.png"
  var keyName = path.join(keyPrefix, fileName);

  return new Promise(function (resolve, reject) {
    fileStream.once('error', reject);
    s3.upload({
      Bucket: bucketName,
      Key: keyName,
      Body: fileStream
    })
      .promise()
      .then(resolve, reject);
  });
}

let results;

let colorGroup = () => {
  return axios.get('https://www.colourlovers.com/api/palettes/random?format=json')
    .then((response) => response.data[0])
}


module.exports.hello = async event => {

  const response = await new Promise((resolve, reject) => {
    colorGroup()
      .then(data => {
        results = {
          title: data.title,
          author: data.userName,
          colors: data.colors,
          url: data.url
        }

        console.log(data)
        console.log(results)

        let width = '1280',
          height = '1280';

        // Utility function, random number between [min..max] range
        const random = (min, max) => Math.random() * (max - min) + min;

        // Generate a whole bunch of circles/arcs
        const count = 100;
        const lines = Array.from(new Array(count)).map(() => {
          return {
            x: random(0, 1280),
            y: random(0, 1280),
            x2: random(0, 1280),
            y2: random(0, 1280),
          };
        });

        let background = "#" + results.colors.pop();

        console.log(results.colors)
        console.log(results.colors.length - 1)


        ctx.fillStyle = 'white';
        ctx.globalAlpha = 1;
        ctx.fillRect(0, 0, width, height);

        const side = Math.min(width, height);
        const globalThickness = 1.5;


        // change this one for the background
        ctx.fillStyle = background;
        ctx.globalAlpha = 1;
        ctx.fillRect(0, 0, width, height);


        lines.forEach(circle => {
          let randomColor = results.colors[Math.floor(random(0, results.colors.length - 1))];

          // Now draw each arc
          ctx.strokeStyle = '#' + randomColor;
          ctx.lineWidth = random(.1, 4);
          ctx.beginPath();       // Start a new path
          ctx.moveTo(random(0, width), random(0, height));
          ctx.lineTo(random(0, width), random(0, height));
          ctx.stroke();
        });

        let decodedImage = canvas.toBuffer().toString('base64'),
          fileName = uuidv4() + '.png';

        let params = {
          "Body": decodedImage,
          "Bucket": "colorglimpse-dev-serverlessdeploymentbucket-9wbi12jgzvez",
          "Key": fileName,
          'ContentType': 'image/png',
        };

        s3.upload(params, (err, data) => {

          if (err) {
            console.log("Upload Failed");
            throw err;
          } else {
            console.log("Upload worked");
          }
        });

        // first we must post the media to Twitter
        T.post('media/upload', { media_data: decodedImage }, function (err, data, response) {
          // now we can assign alt text to the media, for use by screen readers and
          // other text-based presentations and interpreters
          let mediaIdStr = data.media_id_string
          let altText = results.title + ' by ' + results.author;
          let meta_params = { media_id: mediaIdStr, alt_text: { text: altText } }

          T.post('media/metadata/create', meta_params, function (err, data, response) {
            if (!err) {
              // now we can reference the media and post a tweet (media will attach to the tweet)
              let params = { status: results.title + ' by ' + results.author + ' see palette at ' + results.url, media_ids: [mediaIdStr] }

              T.post('statuses/update', params, function (err, data, response) {
                if (err) {
                  return err
              } else {
                  return response
              }
              })
            }
          })
        })

      })
  })

  return response

};
