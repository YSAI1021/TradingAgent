import { Calendar, TrendingUp, AlertTriangle, Lightbulb, FileText } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Separator } from "@/app/components/ui/separator";

export function WeeklyDigest() {
  const weekSummary = {
    period: "Jan 22 - Jan 29, 2026",
    portfolioChange: 5.2,
    totalValue: 257840,
    keyHighlights: [
      "Tech sector led with +7.1% gains",
      "Energy sector recovered +2.3%",
      "Portfolio outperformed S&P 500 by 2.1%"
    ]
  };
  
  const whatMattered = [
    {
      event: "AAPL Q4 Earnings Beat",
      impact: "High",
      outcome: "+$5,240 portfolio value"
    },
    {
      event: "Fed Rate Decision",
      impact: "Medium",
      outcome: "Market volatility normalized"
    },
    {
      event: "XOM Dividend Increase",
      impact: "Low",
      outcome: "+$120 annual income"
    }
  ];
  
  const whatWasNoise = [
    "Daily market commentary",
    "Unconfirmed merger rumors",
    "Social media speculation on meme stocks"
  ];
  
  const behaviorInsights = [
    {
      behavior: "Thesis discipline",
      rating: "good",
      note: "Held positions through volatility as planned"
    },
    {
      behavior: "Concentration risk",
      rating: "attention",
      note: "Tech allocation increased to 65% - consider rebalancing"
    }
  ];
  
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center py-8">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Calendar className="w-6 h-6 text-blue-600" />
          <h1 className="text-3xl font-semibold text-gray-900">Weekly Digest</h1>
        </div>
        <p className="text-gray-500">{weekSummary.period}</p>
      </div>
      
      {/* Portfolio Summary */}
      <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-sm text-gray-600 mb-1">Portfolio Change</p>
              <p className="text-3xl font-semibold text-green-600">+{weekSummary.portfolioChange}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Value</p>
              <p className="text-3xl font-semibold text-gray-900">
                ${weekSummary.totalValue.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">vs S&P 500</p>
              <p className="text-3xl font-semibold text-blue-600">+2.1%</p>
            </div>
          </div>
          
          <Separator className="my-4" />
          
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Key Highlights:</p>
            {weekSummary.keyHighlights.map((highlight, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                {highlight}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* What Mattered vs Noise */}
      <div className="grid grid-cols-2 gap-6">
        {/* What Mattered */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              What Mattered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {whatMattered.map((item, i) => (
                <div key={i} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900">{item.event}</p>
                    <Badge 
                      variant={item.impact === 'High' ? 'destructive' : item.impact === 'Medium' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {item.impact}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600">{item.outcome}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        {/* What Was Noise */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-500">
              <FileText className="w-5 h-5" />
              What Was Noise
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {whatWasNoise.map((noise, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                  {noise}
                </div>
              ))}
            </div>
            
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">
                These events had minimal impact on your portfolio. Our AI filtered 127 news items this week 
                to show you what truly mattered.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Behavior & Rule Highlights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-600" />
            Behavior & Rule Highlights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {behaviorInsights.map((insight, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className={`w-2 h-2 rounded-full mt-1.5 ${
                  insight.rating === 'good' ? 'bg-green-500' : 'bg-yellow-500'
                }`} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 mb-1">{insight.behavior}</p>
                  <p className="text-xs text-gray-600">{insight.note}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Suggested Thesis Updates */}
      <Card className="border-purple-200 bg-purple-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-900">
            <AlertTriangle className="w-5 h-5" />
            Suggested Thesis Updates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="p-3 bg-white rounded-lg border border-purple-200">
              <p className="text-sm font-medium text-gray-900 mb-2">AAPL: Review price target</p>
              <p className="text-sm text-gray-600 mb-2">
                Stock approaching your $200 target. Consider updating exit strategy based on 
                Q4 earnings strength and AI product momentum.
              </p>
              <Badge variant="outline" className="text-xs">Suggested: Raise target to $220</Badge>
            </div>
            
            <div className="p-3 bg-white rounded-lg border border-purple-200">
              <p className="text-sm font-medium text-gray-900 mb-2">Portfolio: Rebalancing needed</p>
              <p className="text-sm text-gray-600">
                Tech concentration has exceeded your 60% threshold. Consider taking partial 
                profits or adding defensive positions.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
