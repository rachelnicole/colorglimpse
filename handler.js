'use strict';
const AWSXRay = require('aws-xray-sdk');
const AWS = AWSXRay.captureAWS(require('aws-sdk'));

AWSXRay.captureHTTPsGlobal(require('http'));
AWSXRay.captureHTTPsGlobal(require('https'));

// captures axios chained promises. 
AWSXRay.capturePromise();

const AxiosWithXray = require('axios');

const { createCanvas } = require('canvas')
const canvas = createCanvas(1280, 1280);
const ctx = canvas.getContext('2d');
const fs = require('fs');
const path = require('path');
const Twit = require('twit');


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

// set up function to upload image to s3 bucket
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

// api call to get random color palette from colourlovers.com
let colorGroup = () => {
  return AxiosWithXray.get('https://www.colourlovers.com/api/palettes/random?format=json')
    .then((response) => response.data[0])
}


module.exports.colorglimpse = async event => {

  const tweet = await new Promise((resolve, reject) => {
    // color lovers api call and setting response to object
    colorGroup()
      .then(data => {
        results = {
          title: data.title,
          author: data.userName,
          colors: data.colors,
          url: data.url
        }


        let width = '1280',
            height = '1280';

        // Utility function, random number between [min..max] range
        const random = (min, max) => Math.random() * (max - min) + min;

        // Generate a lot of lines
        const count = 100;
        const lines = Array.from(new Array(count)).map(() => {
          return {
            x: random(0, 1280),
            y: random(0, 1280),
            x2: random(0, 1280),
            y2: random(0, 1280),
          };
        });

        // Setting the background image from the last hex color in the palette
        let background = "#" + results.colors.pop();
        ctx.fillStyle = background;
        ctx.globalAlpha = 1;
        ctx.fillRect(0, 0, width, height);

        // Drawing each line in the line array, setting each one a different color, length, and width.
        lines.forEach(line => {
          let randomColor = results.colors[Math.floor(random(0, results.colors.length - 1))];

          // Now draw each line
          ctx.strokeStyle = '#' + randomColor;
          ctx.lineWidth = random(.1, 4);
          ctx.beginPath();       // Start a new path
          ctx.moveTo(random(0, width), random(0, height));
          ctx.lineTo(random(0, width), random(0, height));
          ctx.stroke();
        });

        // naming image based off timestamps
        let decodedImage = canvas.toBuffer().toString('base64'),
            current = new Date(),
            todayDate = current.toLocaleString(),
            newDateFormat = todayDate.replace(/\//g, '-'),
            fileName = newDateFormat + '.png';

        // s3 parameters
        let params = {
          "Body": decodedImage,
          "Bucket": "",
          "Key": fileName,
          'ContentType': 'image/png',
        };

        // code to upload image to s3 bucket and return response
        s3.upload(params, (err, data) => {

          if (err) {
            console.log("Upload Failed");
            throw err;
          } else {
            console.log("Upload worked");
          }
        });

        // upload image to twitter
        T.post('media/upload', { media_data: decodedImage }, function (err, data, response) {
          
          let mediaIdStr = data.media_id_string

          // configure alt text
          let altText = results.title + ' by ' + results.author;
          let meta_params = { media_id: mediaIdStr, alt_text: { text: altText } }

          T.post('media/metadata/create', meta_params, function (err, data, response) {
            if (!err) {
              // structure tweet body & attach image
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

  return tweet

};
