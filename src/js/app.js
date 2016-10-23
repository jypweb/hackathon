var nfcService,
    phoneLabel,
    currentPage = "listening",
    currentUID,
    earnRedeem = "earn",
    currentPoints,
    pendingPointTotal = 0,
    startTLV,
    keyCodeLib = {
      8: "backspace",
      13: "enter",
      27: "esc",
      48: "0",
      49: "1",
      50: "2",
      51: "3",
      52: "4",
      53: "5",
      54: "6",
      55: "7",
      56: "8",
      57: "9"
    },
    statusCodes = [
      { tag: "0000016D", status: "transaction-completed-approved" },
      { tag: "0000016E", status: "transaction-completed-declined" },
      { tag: "00000170", status: "transaction-terminated-errors" },
      { tag: "0000016F", status: "transaction-aborted" },
      { tag: "00000171", status: "presented-card-not-supported" },
      { tag: "00000110", status: "presented-card-is-blocked" },
      { tag: "00000172", status: "no-card-detected" },
      { tag: "00000101", status: "internal-invalid-object" },
      { tag: "00000105", status: "not-authorized" },
      { tag: "00000108", status: "missing-data" },
      { tag: "00000109", status: "rng-error" },
      { tag: "00000120", status: "lib-interface-error" },
      { tag: "00000102", status: "memory-error" },
      { tag: "0000FFFE", status: "internal-error" }
    ]
;


document.addEventListener( "DOMContentLoaded", initService );

function initService() {
  startEndService = tetra.startEnd();
  phoneLabel = document.getElementById("phoneNumberValue");
  var backSpaceDown = false,
      backSpaceTimer = false;

  document.getElementById("submitPhoneNumber").addEventListener('click', verifyPhoneAndSubmit);
  document.getElementById("isAMemberEarn").addEventListener('click', function(){pendingPointTotal = currentPoints; hideWeblet();});
  document.getElementById("isAMemberRedeem").addEventListener('click', startRedeem);
  document.addEventListener('keydown', function(e) {
    if (e.keyCode == 27) hideWeblet();
    if (currentPage != "phoneNumber") return;
    if (e.keyCode !== 8) return; //not a backspace
    if (backSpaceDown == false) {
      if (phoneLabel.innerHTML !== "") {
        var currentValue = phoneLabel.innerHTML;
        phoneLabel.innerHTML = currentValue.substring(0, currentValue.length - 1);
        backSpaceTimer = setTimeout(function() {
          backSpaceDown = setInterval(function() {
            var currentValue = phoneLabel.innerHTML;
            if (currentValue !== "") phoneLabel.innerHTML = currentValue.substring(0, currentValue.length - 1);
          }, 100);
        },500);

      }

    }
  });

  document.addEventListener('keyup',function(e) {
    if (currentPage != "phoneNumber") return;
    var keyPressed = keyCodeLib[e.keyCode];
    var currentValue = phoneLabel.innerHTML;

    if (keyPressed !== "backspace" && keyPressed !== "enter" && keyPressed !== "esc") {
      console.log("Phone Label:", currentValue);
      if (currentValue.length !== 10) phoneLabel.innerHTML = currentValue + keyPressed;
    } else  {
      if (keyPressed == "enter") {
        verifyPhoneAndSubmit();
      } else if (keyPressed == "esc") {
        skipLoyalty();
      } else { //backspace
        clearInterval(backSpaceDown);
        clearTimeout(backSpaceTimer);
        backSpaceTimer = false;
        backSpaceDown = false;
      }
    }
  });

  function skipLoyalty() {
    hideWeblet();
  }

  function verifyPhoneAndSubmit() {
    if (phoneLabel.innerHTML.length == 10) {
      console.log("Successful phone entry");
      data = new FormData();
      data.append("cell_phone",phoneLabel.innerHTML);
      data.append("card_hash",currentUID);
      apiPost("https://splatblurt.com/members",data,function() {
        pendingPointTotal = 0;
        hideWeblet();
      },function() {console.log("Error Posted");});
    } else {
      showError("Please enter a 10 digit phone number.");
    }
  }

  startEndService.on('SE_START',function(tlv,properties) {
    console.log("starting",tlv);
    if(properties.isShortMode) {
      this.sendResponse();
      tetra.weblet.hide();
      return;
   }
   else {
    tetra.weblet.show();
    startTLV = tlv;
    showPage("start");
    nfcDetect();
   }
  })
  .on('SE_END',function(tlv,properties) {
    filteredTLV = filterTLV(tlv);
    console.log("FILTERED STUFF!!!",filteredTLV);
    if (filteredTLV.errorId && filteredTLV.errorId == "0000016F") {
      console.log("Canceled transaction");
      hideWeblet();
    } else {
      newAmount = formatAmount(parseInt(filteredTLV.amount),parseInt(filteredTLV.currencyExponentTags));
      updateData = new FormData();
      updateData.append("vendor_id",1);
      updateData.append("card_hash",currentUID);
      updateData.append("points",pendingPointTotal);
      data = new FormData();
      data.append("vendor_id",1);
      data.append("card_hash",currentUID);
      data.append("amount",newAmount);
      apiPost("https://splatblurt.com/transactions/update_points", updateData, function() {
        apiPost("https://splatblurt.com/transactions",data,function() {console.log("yay");},function() {console.log("nay");});
      }, function() {
        console.log("update points failed");
      });
      var pointsEarned = Math.floor(parseFloat(newAmount));


      if(properties.isShortMode) {
        //do very short process
        console.log("short process");
        this.sendResponse();
        return;
      }
      //can do long treatment
      else {
        tetra.weblet.show();
        document.getElementById("pointCount").innerHTML = pointsEarned.toString();
        showPage("thankYou");
      }
    }
  });
}

function startRedeem() {
  filteredTLV = filterTLV(startTLV);
  newAmount = formatAmount(parseInt(filteredTLV.amount),parseInt(filteredTLV.currencyExponentTags));
  var tmp = parseFloat(parseFloat(newAmount).toFixed(2) - currentPoints).toFixed(2);
  console.log("tmp",tmp);
  if (tmp < 0) {
    pendingPointTotal = -parseInt(tmp);
    console.log("still points available",pendingPointTotal);
    newAmount = "000000000000";
  } else {
    pendingPointTotal = 0;
    newAmount = tmp.toString();
    newAmount = newAmount.split(".").join("");
    while(newAmount.length < 12) {
      newAmount = "0" + newAmount;
    }
  }

  if (startTLV[0].tag == "0x9F02") startTLV[0].data = newAmount;

  console.log("Remaining Balance:",newAmount);
  console.log("edited startTLV",startTLV);
  startEndService.sendResponse(startTLV);
  tetra.weblet.hide();
}

function formatAmount(amount,decimalPlaces) {
	var base = Math.pow ( 10, decimalPlaces );
	var int = "" + parseInt ( amount / base ), decimal = "" + ( amount % base );
	while ( decimal.length < decimalPlaces )
	{
		decimal = "0" + decimal;
	}
	var result = [ int, decimal ].join ( "." );
  return result;
}

function filterTLV(tlv) {
    var endStatusTags = tlv.filter ( function ( el, index ) {
      if ( el.tag === "0x9F94891D" )
      {
        return true;
      }
      return false;
    });
    var amountTags = tlv.filter ( function ( el, index ) {
      if ( el.tag === "0x9F02" )
      {
        return true;
      }
      return false;
    });
		var currencyExponentTags = tlv.filter ( function ( el, index ){
			if ( el.tag === "0x5F36" )
			{
				return true;
			}
			return false;
		});
    return {amount: amountTags[0].data,
            currencyExponentTags: currencyExponentTags[0].data,
            errorId: (endStatusTags[0] ? endStatusTags[0].data : 0)
           };
}

function showPage(page) {
  document.getElementById(currentPage).setAttribute("class","hide");
  document.getElementById(page).setAttribute("class","show");
  currentPage = page;
  console.log("Current Page:",currentPage);
  console.log("Requested Page:",page);
  if (page == "thankYou") setTimeout(function() {showPage("listening"); hideWeblet()},3000);
}

function hideWeblet(response) {
  startEndService.sendResponse();
  tetra.weblet.hide();
}

function showError(msg) {
  console.log("Error: ", msg);
}

function checkMemberStatus(response) {
  console.log("We got a UID!!!");
  console.log(response.uid.join(""));
  currentUID = response.uid.join("");
  uidCheck(response.uid.join(""), function() {
    hideWeblet();
  });
}

function uidCheck(uid,callback) {
  var xmlHttp = new XMLHttpRequest();
  xmlHttp.onreadystatechange = function()
  {
      if(xmlHttp.readyState == 4 && xmlHttp.status == 200)
      {
        var response = JSON.parse(xmlHttp.responseText);
        if (response.error) {
          console.log("Error:",response.error); //Not a member
          showPage("phoneNumber");
        } else {
          console.log("Success:",response);
          currentPoints = response.points;
          document.getElementById("memberPointCount").innerHTML = response.points;
          if (response.points > 0) {
            document.getElementById("isAMemberRedeem").setAttribute("class","show");
          } else {
            document.getElementById("isAMemberRedeem").setAttribute("class","hide");
          }
          showPage("isAMember");
        }
      }
      else if (xmlHttp.readyState == 4) {
        console.log("ERROR: ", xmlHttp.responseText);
      }
  }
  xmlHttp.open("get", "https://splatblurt.com/members/find/" + uid);
  xmlHttp.send(null);
}

function apiPost(url, data, success, error) {
  console.log("Information:");
  console.log("url",url);
  console.log("data",data);
  var xmlHttp = new XMLHttpRequest();
  xmlHttp.onreadystatechange = function()
  {
      if(xmlHttp.readyState == 4 && xmlHttp.status == 200)
      {
        var response = xmlHttp.responseText;
        if (response.error) {
          console.log("Error:",response.error);
          if (typeof error == "function") error();
          // showPage("notAMember");
        } else {
          console.log(response);
          if (typeof success == "function") success();
          // showPage("isAMember");
        }
      }
      else if (xmlHttp.readyState == 4) {
        console.log("ERROR: ", xmlHttp.responseText);
      }
  }
  xmlHttp.open("POST", url);
  xmlHttp.send(data);

}

function nfcDetect() {
  nfcService = tetra.service({
    service: 'local.device.contactless0',
    namespace: 'ingenico.device.contactless'
  });
nfcService
.reset() // Reset service
.disconnect() // Disconnect from service
.connect() // Connect to service
.close() // Close service
.open() // Open service
.on('ClessDetectedEvent', function (r) { // Listen to ClessDetectedEvent
console.log('Card detected');
return getCardInformations();
})
.call('StartDetection', {data: {timeout: 360000}}) // Call start detection method
.then(function (r) {
console.log('Please approach your card');
}, function (e) {
console.log(e)
});
}

function getCardInformations() {
var aidCommand = ["00", "A4", "04", "00", "07", "A0", "00", "00", "00", "04", "10", "10", "00"];
var PPSEreponse = [];
nfcService
.reset() // Reset service
.call('GetUid', {requestDelay: 0}) // Call GetUid method
.success(checkMemberStatus);
}
