function doGet() {
    let result = {
      supplies: []

    }


    result.supplies = createSuplies()





    Logger.log(result);

    let response = ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    return response
  }




  function createSuplies() {
    let resultSupplies = []
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const suppliesSheet = ss.getSheetByName('supply');


    const suppliesData = suppliesSheet.getDataRange().getValues();


    suppliesData.shift()



    suppliesData.forEach(([number, name, contractName, coefficient, contractPropSuppliesQuantity, contractProp1, contractProp2, contractPropLoginsQuantity, contractPropComment, contractPropEmail, type, quantityForKp, lcontractProp2, lcontractName, lcontractPropComment, lcontractPropEmail, acontractName, acontractPropComment]) => {


      resultSupplies.push({ number, name, contractName, coefficient, contractPropSuppliesQuantity, contractProp1, contractProp2, contractPropLoginsQuantity, contractPropComment, contractPropEmail, type, quantityForKp, lcontractProp2, lcontractName, lcontractPropComment, lcontractPropEmail, acontractName, acontractPropComment });


    });



    return resultSupplies
  }
