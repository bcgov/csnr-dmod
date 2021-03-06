package pages.app
import geb.Page

import extensions.AngularJSAware

class HomePage extends Page implements AngularJSAware {
 
	static at = { angularReady && title == "CSNR DMOD - Development Environment" }
    static url = "" 
    static content = {
        HomeLink { $("a", "ui-sref":"projects",1) }
        BackToDemoLink { $("a", href:"/p/d-1/docs", text:"Back to the demo") }
        
    }
}
