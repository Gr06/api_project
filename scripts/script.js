// From https://schier.co/blog/2014/12/08/wait-for-user-to-stop-typing-using-javascript.html
var timeout = null;

// Listen for keystroke events
$("#search").keyup(function() {
    // Clear the timeout if it has already been set.
    // This will prevent the previous task from executing
    // if it has been less than <MILLISECONDS>
    clearTimeout(timeout);

    // Make a new timeout set to go off in 500ms
    timeout = setTimeout(function () {
        if ($("#search").val().length > 2) {
          searchPicsByTag($("#search").val());
        }
        else if ($("#search").val().length == 0) {
          group.eachLayer(function(layer){
              mymap.addLayer(layer);
          });
        }
    }, 500);
});

// searchPicsByTag(tag) : filter the markers shown on the map (by tag)
function searchPicsByTag(tag) {
  group.eachLayer(function(layer){
    mymap.removeLayer(layer);
  });
  group.eachLayer(function(layer){
    if ($.inArray(tag,layer.options.tags)>-1){
      mymap.addLayer(layer);
    }
  });
}
//----------------------------------------------------- Clarifai -----------------------------------------------------


const app = new Clarifai.App({apiKey: 'e3e99f717d6746679b7052ea587dc801'});



//----------------------------------------------------- MapBox -----------------------------------------------------

// creating the map
let mymap = L.map('mapid', {
  minZoom: 2,
  maxZoom: 13
}).setView([51.505, -0.09], 13);
let marker;
let group = new L.featureGroup([]);

// adding the layer
L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoianVsZXNlcnJvciIsImEiOiJjamVoYXR4N2cyeDJyMnhwcnlqM210bTMxIn0.rsgFI2_hJj9qrFrikIYdJg', {
    attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
    maxZoom: 18,
    id: 'mapbox.streets',
    accessToken: 'pk.eyJ1IjoianVsZXNlcnJvciIsImEiOiJjamVoYXR4N2cyeDJyMnhwcnlqM210bTMxIn0.rsgFI2_hJj9qrFrikIYdJg'
}).addTo(mymap);


//----------------------------------------------------- Input -----------------------------------------------------



let imgId;
let base64Img;

let latitude;
let longitude;
let img = [];


function readURL(input) {

  let reader;
  if (input.files && input.files[0]) {
    reader = new FileReader();

    reader.onload = function(e) {

      // append picture (for exif.js analysis) : 
      base64Img = reader.result;
      let imgElement = createImgElement(base64Img);
      $('body').append(imgElement);
      
      // upload picture on imgUr :
      let urlUpload = uploadImgur();

      // get Clarifai analysis (by sending url)
      getAllPredictionTags(urlUpload);
      
    }
    reader.readAsDataURL(input.files[0]);
  }
  else {
    console.log("Error: no files in reader");
  }
  
}

// createImgElement(base64Img) : create img element object (for further EXIF analysis)
function createImgElement(base64Img) {

  let imgElement = document.createElement("IMG");
  imgElement.setAttribute('src', base64Img);
  imgElement.setAttribute("id",imgId);
  imgElement.setAttribute("hidden", true);
  return imgElement;
}

// event of the browse button
$("#btnBrowse").change(function() {

  let date = new Date();
  imgId = date.getTime();
  readURL(this);

});

// uploadImgur() : AJAX request to imgur API
function uploadImgur() {

      // With help of https://ctrlq.org/code/20526-javascript-image-uploader

      console.log("Uploading file to Imgur..");

      let apiUrl = 'https://api.imgur.com/3/image';
      let apiKey = '9a8104a85846172';

      let settings = {
        async: false,
        crossDomain: true,
        processData: false,
        contentType: false,
        type: 'POST',
        url: apiUrl,
        headers: {
          Authorization: "Bearer a96cdb73d0ee014d4e9420e5e45d538e9631d9ff",
        },
        mimeType: 'multipart/form-data'
      };

      let formData = new FormData();
      let urlUpload;
      let base64ImgNoHeader = base64Img.split(",")[1];

      formData.append("image",base64ImgNoHeader);
      settings.data = formData;

      $.ajax(settings).done(function(response) {
        let responseJson = JSON.parse(response);
        urlUpload = responseJson.data.link;
        console.log(urlUpload);
      });

      return urlUpload;
}


// getAllPredictionTags(url) : get tags from the picture using Clarifai API
function getAllPredictionTags(url){

  let tags = new Array();

  app.models.predict(Clarifai.GENERAL_MODEL,url).then(
    function(response) {
      let concepts = response.outputs[0].data.concepts;
      jQuery.each(concepts,function(){
        tags.push(this.name);
      });
      sendData(tags,url);
    },
    function(err) {
      console.log("sendData error:",err);
    }
  );

}

// senData(tags,url) : send to the PB2 server latitude + longitude + url + tags
async function sendData(tags,url) {

  //todo : verify if reader is null

  await getExif();
  msgJson.lat = latitude;
  msgJson.lng = longitude;
  msgJson.img = url;
  msgJson.tags = tags;
  pb2.sendJson(msgJson);

}



  // ----------------------------------------------------- PB2 socket -----------------------------------------------------


  const pb2 = new PB2('https://pb2-2018.jelastic.metropolia.fi/', 'first_app_8566');

  const msgJson = {};
  
  pb2.setReceiver(function(data) {

    // setting the marker content (html + coordinates) :
    let htmlMsg = "<img style='width: 200px; height:auto' src='"+data["json"]["img"]+"'>";
    htmlMsg+="<div style='width: 200px'><p><b>Tags: </b>";
    let ttags = data["json"]["tags"];
    data["json"]["tags"].forEach(function(element){
      if (element == ttags[ttags.length-1]) {
        htmlMsg+=element+".";
      }
      else
        htmlMsg+=element+", ";
    });
    htmlMsg+="</p></div>";

    // adding the marker and its popup
    marker = L.marker([data["json"]["lat"],data["json"]["lng"]],
    {tags : data["json"]["tags"]}
    ).addTo(mymap);
    marker.bindPopup(htmlMsg);
    group.addLayer(marker);
    mymap.fitBounds(group.getBounds());
      
  });
  

// ----------------------------------------------------- EXIF -----------------------------------------------------

// convertGPS(gps) : convert the GPS format of the coordinates (to decimal degrees)
function convertGPS(gps) {

  let table = String(gps).split(",");
  gps = Number(table[0])+(Number(table[1])/60)+((Number(table[2]))/6000);
  return gps;

}

// getExif() : get latitude and longitude from EXIF with exif.js library
async function getExif() {

  await getImage();
    EXIF.getData(img[imgId], function() {
    let lng = EXIF.getTag(this, "GPSLongitude");
    let lat = EXIF.getTag(this, "GPSLatitude");
    longitude = Number((convertGPS(lng)).toFixed(4));
    latitude = Number((convertGPS(lat)).toFixed(4));
  });

}

// getImage() : get the img element object created previously
function getImage() {

  img[imgId] = document.getElementById(imgId);

}

