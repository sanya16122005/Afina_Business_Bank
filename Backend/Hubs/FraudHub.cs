using Microsoft.AspNetCore.SignalR;

namespace Backend.Hubs
{
    
    public class FraudHub : Hub
    {
        public override async Task OnConnectedAsync()
        {
            await base.OnConnectedAsync();
        }
    }
}
