var cv = require('opencv');
var _ = require('lodash');

var Tesseract = require('tesseract.js')

var express = require('express');
var app = express();

app.use(express.static('public'));


var imgProc = {
    file: 'ikea',
    dir: __dirname + '/public/images/',

    imgSave: [],

    blue: [255,0,0],
    red: [0,0,255],
    green: [0,255,0],
    white: [255,255,255],

    lowerRed: [0,100,100],
    upperRed: [10,255,255],

    minArea: 20000,

    minAreaTicket: 1000,
    maxAreaTicket: 20000,

    cannyFrom: 75,
    cannyTo: 200,

    dilate: 1,

    arcLength: 0.05,

    pointOrder: function (point) {
        var ordered = [];

        var sum = [];
        for (var x in point) {
            sum[x] = point[x].x+point[x].y;
        }

        ordered[0] = point[sum.indexOf(_.min(sum))];
        ordered[2] = point[sum.indexOf(_.max(sum))];

        var diff = [];
        for (var x in point) {
            diff[x] = point[x].x-point[x].y;
        }

        ordered[1] = point[diff.indexOf(_.max(diff))];
        ordered[3] = point[diff.indexOf(_.min(diff))];

        return ordered;
    },

    pointWidth: function (p1, p2) {
        var width = 0;
        width = Math.sqrt(Math.pow((p2.x-p1.x), 2) + Math.pow((p2.y-p1.y), 2));
        return width;
    },
    saveImage: function (img) {
        imgName = this.dir+this.file+(this.imgSave.length+1)+'.jpg';
        img.save(imgName);
        this.imgSave.push(imgName);
    },
    init: function () {
        this.imgSave.push(this.dir+this.file+'.jpg');
    }
};

imgProc.init();

cv.readImage(imgProc.dir+imgProc.file+'.jpg', function (err, img) {
    if (err) {
        throw err;
    }

    var process = img.copy();

    // convert to HSV
    process.convertHSVscale();

    // find only red
    process.inRange(imgProc.lowerRed, imgProc.upperRed);
    imgProc.saveImage(process);

/*    // canny
    process.canny(imgProc.cannyFrom, imgProc.cannyTo);
    imgProc.saveImage(process);

    // dilate
    process.dilate(imgProc.dilate);
    imgProc.saveImage(process);*/

    // find top contours
    var contourImg = img.copy();

    var possibleContour = [];
    var contours = process.findContours();

    for (var i = 0; i < contours.size(); i++) {
        if (contours.area(i) < imgProc.minArea) continue;

        var arcLength = contours.arcLength(i, true);
        contours.approxPolyDP(i, imgProc.arcLength * arcLength, true);

        switch(contours.cornerCount(i)) {
            case 4:
                contourImg.drawContour(contours, i, imgProc.green);
                break;
            default:
                contourImg.drawContour(contours, i, imgProc.red);
        }
        if (contours.cornerCount(i) ==4) {
            possibleContour.push(imgProc.pointOrder(contours.points(i)));
        }
    }
    imgProc.saveImage(contourImg);

    // warp contours
    var warpImg = [];
    for (var x in possibleContour) {
        var point = possibleContour[x];
        var maxWidth = 0;
        var maxHeight = 0;
        var tmp = 0;

        if (imgProc.pointWidth(point[0], point[1]) > imgProc.pointWidth(point[3], point[2])) {
            maxWidth = Math.round(imgProc.pointWidth(point[0], point[1]));
        } else {
            maxWidth = Math.round(imgProc.pointWidth(point[3], point[2]));
        }
        if (imgProc.pointWidth(point[0], point[3]) > imgProc.pointWidth(point[1], point[2])) {
            maxHeight = Math.round(imgProc.pointWidth(point[0], point[3]));
        } else {
            maxHeight = Math.round(imgProc.pointWidth(point[1], point[2]));
        }

        var tmpWarpImg = img.copy();

        var srcWarp = [point[0].x, point[0].y, point[1].x, point[1].y, point[2].x, point[2].y, point[3].x, point[3].y];
        var dstWarp = [0, 0, maxWidth, 0, maxWidth, maxHeight, 0, maxHeight];

        var perspective = tmpWarpImg.getPerspectiveTransform(srcWarp, dstWarp);

        tmpWarpImg.warpPerspective(perspective, maxWidth, maxHeight, [255, 255, 255]);

        if (maxWidth < maxHeight) {
            //tmpWarpImg.rotate(90);
        }

        warpImg.push(tmpWarpImg);
        //imgProc.saveImage(tmpWarpImg);
    }

    // filter wrapped img
    var trueWarpImg = [];
    for (var x in warpImg) {
        var warpedImg = warpImg[x].copy();

        // convert to HSV
        warpedImg.convertHSVscale();

        // find only red
        warpedImg.inRange(imgProc.lowerRed, imgProc.upperRed);
        imgProc.saveImage(warpedImg);


        var possibleContour = [];
        var contourImg = warpImg[x].copy();
        var contours = warpedImg.findContours();

        for (var i = 0; i < contours.size(); i++) {
            if (contours.area(i) < imgProc.minAreaTicket || contours.area(i) > imgProc.maxAreaTicket) continue;

            var arcLength = contours.arcLength(i, true);
            contours.approxPolyDP(i, imgProc.arcLength * arcLength, true);

            switch(contours.cornerCount(i)) {
                case 4:
                    contourImg.drawContour(contours, i, imgProc.green);
                    break;
                default:
                    contourImg.drawContour(contours, i, imgProc.red);
            }
            if (contours.cornerCount(i) ==4) {
                possibleContour.push(imgProc.pointOrder(contours.points(i)));
            }
        }

        if (possibleContour.length == 3) {
            imgProc.saveImage(contourImg);

            var trueContour = [];
            var width = [];
            var tmpContour = _.cloneDeep(possibleContour);

            for (var x2 in tmpContour) {
                width.push(tmpContour[x2][1].x - tmpContour[x2][0].x);
            }

            var maxIndex = width.indexOf(_.max(width));

            trueContour[0] = tmpContour[maxIndex];

            var left = [];
            for (var x2 in tmpContour) {
                if (x2 == maxIndex) continue;
                left.push(tmpContour[x2][0].x);
            }

            trueContour[1] = tmpContour[left.indexOf(_.min(left))];
            trueContour[2] = tmpContour[left.indexOf(_.max(left))];


            trueWarpImg.push({img: warpImg[x], contour: trueContour});
        }
    }

    // find label in true warp img

    var labelImg = [];
    for (var x in trueWarpImg) {
        labelImg[x] = [];
        var ticketImg = trueWarpImg[x].img;
        var ticketContour = trueWarpImg[x].contour;

        for (var x2 in ticketContour) {
            var point = ticketContour[x2];

            var maxWidth = 0;
            var maxHeight = 0;

            if (imgProc.pointWidth(point[0], point[1]) > imgProc.pointWidth(point[3], point[2])) {
                maxWidth = Math.round(imgProc.pointWidth(point[0], point[1]));
            } else {
                maxWidth = Math.round(imgProc.pointWidth(point[3], point[2]));
            }


            if (imgProc.pointWidth(point[0], point[3]) > imgProc.pointWidth(point[1], point[2])) {
                maxHeight = Math.round(imgProc.pointWidth(point[0], point[3]));
            } else {
                maxHeight = Math.round(imgProc.pointWidth(point[1], point[2]));
            }

            var tmpWarpImg = ticketImg.copy();

            var srcWarp = [point[0].x, point[0].y, point[1].x, point[1].y, point[2].x, point[2].y, point[3].x, point[3].y];
            var dstWarp = [0, 0, maxWidth, 0, maxWidth, maxHeight, 0, maxHeight];

            var perspective = tmpWarpImg.getPerspectiveTransform(srcWarp, dstWarp);

            tmpWarpImg.warpPerspective(perspective, maxWidth, maxHeight, [255, 255, 255]);

            // crop
            tmpWarpImg = tmpWarpImg.crop(2,2,tmpWarpImg.width()-4,tmpWarpImg.height()-4);

            labelImg[x].push(tmpWarpImg);

            imgProc.saveImage(tmpWarpImg);
        }
    }

    // ocr img
    for (var x in labelImg) {
        var label = labelImg[x];
        for (var x2 in label) {
            var labelLine = label[x2];

            // convert to HSV
            labelLine.convertHSVscale();

            // find only red
            labelLine.inRange(imgProc.lowerRed, imgProc.upperRed);

            // labelLine.gaussianBlur([5,5]);
            labelLine.resize(labelLine.width()*3,labelLine.height()*3);

            Tesseract.recognize(labelLine.toBuffer(), {
                lang: 'eng',
                tessedit_char_whitelist: '0123456789.'
            })
                .progress(function(msg){console.log('tesseract', msg)})
                .catch(function(msg){console.log('tesseract', msg)})
                .then(function(result){console.log('tesseract', result.text.trim())});

            imgProc.saveImage(labelLine);
        }
    }
});

app.get('/', function (req, res) {

    var html = '';
    for (var x in imgProc.imgSave) {
        html+='<img src="/images/'+imgProc.imgSave[x].replace(imgProc.dir, '')+'" style="max-width:300px;" />';
    }

    res.send(html);
});

app.listen(3000, function () {
    console.log('Example app listening on port 3000!');
});